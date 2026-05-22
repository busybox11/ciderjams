import {
  createLogger,
  type ClientWireMessage,
  type QueueStateSchema,
} from "@ciderjams/proto";

import type { CiderSyncSocket } from "../lib/api";
import {
  makeQueuePayload,
  mapRepeatMode,
  mapShuffleMode,
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
  private lastKnownIndex: number;
  private lastEmittedPlaying: boolean | null = null;
  private seekTimer: ReturnType<typeof setTimeout> | null = null;
  private queueTimer: ReturnType<typeof setTimeout> | null = null;

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
  }

  stop(): void {
    for (const dispose of this.eventCleanups) dispose();
    this.eventCleanups.length = 0;
    this.lastEmittedPlaying = null;
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

  private sendQueueSoon(): void {
    if (this.shouldSuppress()) return;
    if (this.queueTimer) clearTimeout(this.queueTimer);
    this.queueTimer = setTimeout(() => {
      this.queueTimer = null;
      try {
        this.send({
          event: "queue.set",
          payload: makeQueuePayload(this.music, this.getLastJamQueue()),
        });
      } catch (error) {
        log.warn("guest queue.set failed", error);
      }
    }, 100);
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

    if (PLAY_EVENTS.has(event)) {
      this.emitPlayPause(true);
      return;
    }

    if (PAUSE_EVENTS.has(event)) {
      this.emitPlayPause(false);
      return;
    }

    if (event === "playbackStateDidChange") {
      this.emitPlayPause(this.isPlayingFromEvent(event, data));
      return;
    }

    if (SEEK_EVENTS.has(event)) {
      this.sendSeekSoon();
      return;
    }

    if (event === "queuePositionDidChange") {
      this.sendIndexChange();
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

  private emitPlayPause(playing: boolean): void {
    if (this.lastEmittedPlaying === playing) return;
    this.lastEmittedPlaying = playing;
    this.send({
      event: playing ? "player.play" : "player.pause",
      payload: {},
    });
  }

  private sendIndexChange(): void {
    const nextIndex = this.music.nowPlayingItemIndex ?? 0;
    const previousIndex = this.lastKnownIndex;
    this.lastKnownIndex = nextIndex;

    if (nextIndex === previousIndex) return;
    this.send({
      event: nextIndex > previousIndex ? "player.next" : "player.previous",
      payload: {},
    });
  }
}
