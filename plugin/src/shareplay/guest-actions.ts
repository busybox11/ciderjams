import {
  createLogger,
  type ClientWireMessage,
  type QueueStateSchema,
} from "@ciderjams/proto";

import type { CiderSyncSocket } from "../lib/api";
import {
  INTERNAL_PLUGIN_QUEUE_SYNC_EVENTS,
  INTERNAL_PLUGIN_SUBSCRIBE_EVENTS,
  internalPluginEvents,
} from "../lib/events";
import {
  isSameCatalogIdOrder,
  jamQueueCatalogIds,
  makeQueuePayload,
  mapRepeatMode,
  mapShuffleMode,
  musicKitQueueCatalogIds,
  playbackPositionMs,
} from "../lib/musickit/payloads";
import { subscribeMusicKitEvent } from "./musickit-bridge";

const log = createLogger("plugin", "shareplay/guest-actions");

const PLAY_EVENTS = new Set(["playbackPlay"]);
const PAUSE_EVENTS = new Set(["playbackPause", "playbackStop"]);
const SEEK_EVENTS = new Set(["playbackSeek", "playbackScrub"]);

const GUEST_MUSICKIT_EVENTS = [
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

export class SharePlayGuestActions {
  private readonly eventCleanups: (() => void)[] = [];
  private readonly internalEventCleanups: (() => void)[] = [];
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
    private readonly getLastJamQueue: () => QueueStateSchema | null,
  ) {
    this.lastKnownIndex = music.nowPlayingItemIndex ?? 0;
  }

  start(): void {
    this.lastEmittedPlaying = this.music.isPlaying;
    for (const event of GUEST_MUSICKIT_EVENTS) {
      this.eventCleanups.push(
        subscribeMusicKitEvent(this.music, event, (data) =>
          this.handleMusicKitEvent(event, data),
        ),
      );
    }

    for (const event of INTERNAL_PLUGIN_SUBSCRIBE_EVENTS) {
      const handler = () => this.handleInternalPluginEvent(event);
      internalPluginEvents.addEventListener(event, handler);
      this.internalEventCleanups.push(() =>
        internalPluginEvents.removeEventListener(event, handler),
      );
    }
  }

  stop(): void {
    for (const dispose of this.eventCleanups) dispose();
    this.eventCleanups.length = 0;
    for (const dispose of this.internalEventCleanups) dispose();
    this.internalEventCleanups.length = 0;
    this.lastEmittedPlaying = null;
    this.indexFlushScheduled = false;
    this.playbackFlushScheduled = false;
    if (this.seekTimer) clearTimeout(this.seekTimer);
    if (this.queueTimer) clearTimeout(this.queueTimer);
    this.seekTimer = null;
    this.queueTimer = null;
  }

  private send(message: ClientWireMessage): void {
    if (this.shouldSuppress()) return;
    if (this.socket.ws.readyState !== WebSocket.OPEN) return;
    log.debug("sending guest action", message);
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
          payload: makeQueuePayload(this.music, this.getLastJamQueue()),
        });
      } catch (error) {
        log.warn("guest queue.set failed", error);
      }
    }, delayMs);
  }

  /** Cider drag-reorder updates queueHash without MusicKit queue lifecycle events. */
  private handleInternalPluginEvent(event: string): void {
    if (!INTERNAL_PLUGIN_QUEUE_SYNC_EVENTS.includes(event)) return;
    if (this.shouldSuppress()) return;
    log.debug("guest queue hash change → queue.set");
    this.sendQueueSoon(150);
  }

  private isPlayingFromEvent(event: string, data: unknown): boolean {
    if (event === "playbackStateDidChange" && data && typeof data === "object") {
      const state = (data as { state?: number }).state;
      if (state === MusicKit.PlaybackStates.playing) return true;
      if (
        state === MusicKit.PlaybackStates.paused ||
        state === MusicKit.PlaybackStates.stopped
      ) {
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
        ? this.isPlayingFromEvent(event, data)
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

  /** Emit one next/previous per index step after MK settles (handles burst skips). */
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

  private handleMusicKitEvent(event: string, data?: unknown): void {
    if (this.shouldSuppress()) {
      if (
        event === "playbackStateDidChange" ||
        PLAY_EVENTS.has(event) ||
        PAUSE_EVENTS.has(event)
      ) {
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

    if (PLAY_EVENTS.has(event) || PAUSE_EVENTS.has(event)) {
      this.schedulePlaybackFlush(event, data);
      return;
    }

    if (event === "playbackStateDidChange") {
      this.schedulePlaybackFlush(event, data);
      return;
    }

    if (SEEK_EVENTS.has(event)) {
      this.sendSeekSoon();
      return;
    }

    if (event === "queuePositionDidChange") {
      const mkOrder = musicKitQueueCatalogIds(this.music);
      const jamOrder = jamQueueCatalogIds(this.getLastJamQueue());
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
