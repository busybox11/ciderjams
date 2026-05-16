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
import { getMusicKitAppDispatcher } from "./musickit-bridge";

const log = createLogger("plugin", "shareplay/guest-actions");

const PLAY_EVENTS = new Set(["playbackPlay"]);
const PAUSE_EVENTS = new Set(["playbackPause", "playbackStop"]);
const SEEK_EVENTS = new Set(["playbackSeek", "playbackScrub"]);

export class SharePlayGuestActions {
  private readonly handlers = new Map<string, (...args: unknown[]) => void>();
  private lastKnownIndex: number;
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
    const dispatcher = getMusicKitAppDispatcher(this.music);
    if (!dispatcher) return;

    for (const event of [
      "playbackPlay",
      "playbackPause",
      "playbackStop",
      "playbackSeek",
      "playbackScrub",
      "queueItemsDidChange",
      "queuePositionDidChange",
      "repeatModeDidChange",
      "shuffleModeDidChange",
    ]) {
      const handler = () => this.handleMusicKitEvent(event);
      this.handlers.set(event, handler);
      dispatcher.subscribe(event, handler);
    }
  }

  stop(): void {
    const dispatcher = getMusicKitAppDispatcher(this.music);
    if (dispatcher) {
      this.handlers.forEach((handler, event) => {
        dispatcher.unsubscribe(event, handler);
      });
    }
    this.handlers.clear();
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

  private handleMusicKitEvent(event: string): void {
    if (this.shouldSuppress()) {
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
      this.send({ event: "player.play", payload: {} });
      return;
    }

    if (PAUSE_EVENTS.has(event)) {
      this.send({ event: "player.pause", payload: {} });
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
