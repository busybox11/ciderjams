import type { CiderSyncSocket } from "../../api/client";

import { type ClientWireMessage, createLogger, type QueueStateSchema } from "@ciderjams/proto";

import {
  INTERNAL_PLUGIN_QUEUE_SYNC_EVENTS,
  INTERNAL_PLUGIN_SUBSCRIBE_EVENTS,
  internalPluginEvents,
} from "../../cider/events";
import {
  isSameCatalogIdOrder,
  jamQueueCatalogIds,
  makeQueuePayload,
  mapRepeatMode,
  mapShuffleMode,
  musicKitQueueCatalogIds,
  playbackPositionMs,
} from "../../musickit/payloads";
import { subscribeMusicKitEvent } from "../../playback/bridge";

const log = createLogger("plugin", "session/guest/actions");

const PLAY_EVENTS = new Set(["playbackPlay"]);
const PAUSE_EVENTS = new Set(["playbackPause", "playbackStop"]);
const SEEK_EVENTS = new Set(["playbackSeek", "playbackScrub"]);

const MK_EVENTS = [
  "playbackPlay",
  "playbackPause",
  "playbackStop",
  "playbackStateDidChange",
  "playbackSeek",
  "playbackScrub",
  "queueItemsDidChange",
  "queuePositionDidChange",
  "repeatModeDidChange",
  "shuffleModeDidChange",
] as const;

/** Maps local MusicKit controls → jam room WS commands (guest / non-host). */
export class JamGuestActions {
  private readonly mkCleanups: (() => void)[] = [];
  private readonly pluginCleanups: (() => void)[] = [];
  private lastKnownIndex: number;
  private lastEmittedPlaying: boolean | null = null;
  private seekTimer: ReturnType<typeof setTimeout> | null = null;
  private queueTimer: ReturnType<typeof setTimeout> | null = null;
  private indexFlushScheduled = false;
  private playbackFlushScheduled = false;

  constructor(
    private readonly music: MusicKit.MusicKitInstanceLoose,
    private readonly socket: CiderSyncSocket,
    private readonly shouldSuppress: () => boolean,
    private readonly getJamQueue: () => QueueStateSchema | null,
  ) {
    this.lastKnownIndex = music.nowPlayingItemIndex ?? 0;
  }

  start(): void {
    this.lastEmittedPlaying = this.music.isPlaying;

    for (const event of MK_EVENTS) {
      this.mkCleanups.push(
        subscribeMusicKitEvent(this.music, event, (data) => this.onMusicKitEvent(event, data)),
      );
    }

    for (const event of INTERNAL_PLUGIN_SUBSCRIBE_EVENTS) {
      const handler = () => this.onPluginQueueEvent(event);
      internalPluginEvents.addEventListener(event, handler);
      this.pluginCleanups.push(() => internalPluginEvents.removeEventListener(event, handler));
    }
  }

  stop(): void {
    for (const dispose of this.mkCleanups) dispose();
    this.mkCleanups.length = 0;
    for (const dispose of this.pluginCleanups) dispose();
    this.pluginCleanups.length = 0;
    this.lastEmittedPlaying = null;
    this.indexFlushScheduled = false;
    this.playbackFlushScheduled = false;
    if (this.seekTimer) clearTimeout(this.seekTimer);
    if (this.queueTimer) clearTimeout(this.queueTimer);
    this.seekTimer = null;
    this.queueTimer = null;
  }

  // --- WS outbound ---

  private send(message: ClientWireMessage): void {
    if (this.shouldSuppress()) return;
    if (this.socket.ws.readyState !== WebSocket.OPEN) return;
    log.debug("guest → room", message.event);
    this.socket.send(message);
  }

  private sendSeekSoon(): void {
    if (this.shouldSuppress()) return;
    if (this.seekTimer) clearTimeout(this.seekTimer);
    this.seekTimer = setTimeout(() => {
      this.seekTimer = null;
      this.send({
        event: "player.seek",
        payload: { positionMs: playbackPositionMs(this.music) },
      });
    }, 100);
  }

  private sendQueueSoon(delayMs = 100): void {
    if (this.shouldSuppress()) return;
    if (this.queueTimer) clearTimeout(this.queueTimer);
    this.queueTimer = setTimeout(() => {
      this.queueTimer = null;
      if (this.shouldSuppress()) return;
      try {
        this.send({
          event: "queue.set",
          payload: makeQueuePayload(this.music, this.getJamQueue()),
        });
      } catch (error) {
        log.warn("guest queue.set failed", error);
      }
    }, delayMs);
  }

  // --- coalesced MK → room (one microtask per burst) ---

  private playingFromEvent(event: string, data: unknown): boolean {
    if (event === "playbackStateDidChange" && data && typeof data === "object") {
      const state = (data as { state?: number }).state;
      if (state === MusicKit.PlaybackStates.playing) return true;
      if (state === MusicKit.PlaybackStates.paused || state === MusicKit.PlaybackStates.stopped) {
        return false;
      }
    }
    return this.music.isPlaying;
  }

  private schedulePlaybackFlush(event: string, data?: unknown): void {
    if (this.playbackFlushScheduled) return;
    this.playbackFlushScheduled = true;
    const playingHint =
      event === "playbackStateDidChange"
        ? this.playingFromEvent(event, data)
        : PLAY_EVENTS.has(event)
          ? true
          : PAUSE_EVENTS.has(event)
            ? false
            : null;

    queueMicrotask(() => {
      this.playbackFlushScheduled = false;
      if (this.shouldSuppress()) {
        this.lastEmittedPlaying = this.music.isPlaying;
        return;
      }
      const playing = playingHint ?? this.music.isPlaying;
      if (this.lastEmittedPlaying === playing) return;
      this.lastEmittedPlaying = playing;
      this.send({
        event: playing ? "player.play" : "player.pause",
        payload: {},
      });
    });
  }

  private scheduleIndexFlush(): void {
    if (this.indexFlushScheduled) return;
    this.indexFlushScheduled = true;
    queueMicrotask(() => {
      this.indexFlushScheduled = false;
      if (this.shouldSuppress()) {
        this.lastKnownIndex = this.music.nowPlayingItemIndex ?? 0;
        return;
      }

      const nextIndex = this.music.nowPlayingItemIndex ?? 0;
      const prevIndex = this.lastKnownIndex;
      if (nextIndex === prevIndex) return;

      const forward = nextIndex > prevIndex;
      const steps = Math.abs(nextIndex - prevIndex);
      this.lastKnownIndex = nextIndex;

      for (let i = 0; i < steps; i++) {
        this.send({
          event: forward ? "player.next" : "player.previous",
          payload: {},
        });
      }
    });
  }

  // --- event handlers ---

  private onPluginQueueEvent(event: string): void {
    if (!INTERNAL_PLUGIN_QUEUE_SYNC_EVENTS.includes(event)) return;
    if (this.shouldSuppress()) return;
    this.sendQueueSoon(150);
  }

  private onMusicKitEvent(event: string, data?: unknown): void {
    if (this.shouldSuppress()) {
      if (event === "playbackStateDidChange" || PLAY_EVENTS.has(event) || PAUSE_EVENTS.has(event)) {
        this.lastEmittedPlaying = this.music.isPlaying;
      }
      if (event === "queuePositionDidChange") {
        this.lastKnownIndex = this.music.nowPlayingItemIndex ?? 0;
      }
      if (SEEK_EVENTS.has(event) && this.seekTimer) {
        clearTimeout(this.seekTimer);
        this.seekTimer = null;
      }
      if (event === "queueItemsDidChange" && this.queueTimer) {
        clearTimeout(this.queueTimer);
        this.queueTimer = null;
      }
      return;
    }

    if (PLAY_EVENTS.has(event) || PAUSE_EVENTS.has(event) || event === "playbackStateDidChange") {
      this.schedulePlaybackFlush(event, data);
      return;
    }

    if (SEEK_EVENTS.has(event)) {
      this.sendSeekSoon();
      return;
    }

    if (event === "queuePositionDidChange") {
      const mkOrder = musicKitQueueCatalogIds(this.music);
      const jamOrder = jamQueueCatalogIds(this.getJamQueue());
      if (!isSameCatalogIdOrder(mkOrder, jamOrder)) {
        this.sendQueueSoon();
        return;
      }
      this.scheduleIndexFlush();
      return;
    }

    if (event === "queueItemsDidChange") {
      this.sendQueueSoon();
      return;
    }

    if (event === "repeatModeDidChange") {
      this.send({
        event: "player.setRepeat",
        payload: { repeatMode: mapRepeatMode(this.music.repeatMode ?? 0) },
      });
      return;
    }

    if (event === "shuffleModeDidChange") {
      this.send({
        event: "player.setShuffle",
        payload: { shuffleMode: mapShuffleMode(this.music.shuffleMode ?? 0) },
      });
    }
  }
}

/** @deprecated use {@link JamGuestActions} */
export const SharePlayGuestActions = JamGuestActions;
