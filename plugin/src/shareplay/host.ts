import { getMusicKitAppDispatcher } from "./musickit-bridge";

import { createLogger } from "@ciderjams/proto";

const log = createLogger("plugin", "shareplay/host");

/** `queue.state` — queue membership / order (rebuild `queue.set` from `music.queue`). */
export const MK_QUEUE_EVENTS: string[] = [
  "queueItemsDidChange",
  "queueModified",
];

/**
 * `player.state` — index, elapsed, play/pause, repeat/shuffle/autoplay, skip/sharePlay nav.
 * Throttle `playbackTimeDidChange` before emitting `player.seek` / position updates.
 */
export const MK_PLAYBACK_EVENTS: string[] = [
  "nowPlayingItemWillChange",
  "nowPlayingItemDidChange",
  "queuePositionDidChange",
  "playbackStateDidChange",
  "playbackPlay",
  "playbackPause",
  "playbackStop",
  "playbackSeek",
  "playbackScrub",
  "playbackTimeDidChange",
  "playbackSkip",
  "repeatModeDidChange",
  "shuffleModeDidChange",
  "autoplayEnabledDidChange",
  "playerActivate",
  "playerExit",
  "sharePlay.nextItem",
  "sharePlay.previousItem",
];

const MUSICKIT_EVENTS: string[] = [...MK_QUEUE_EVENTS, ...MK_PLAYBACK_EVENTS];

export class SharePlayHost {
  private music: MusicKit.MusicKitInstance | null = null;
  private events: Map<string, (...args: unknown[]) => void> = new Map();

  constructor(music: MusicKit.MusicKitInstance) {
    this.music = music;
  }

  public inject() {
    const music = this.music;
    if (!music) return;

    const dispatcher = getMusicKitAppDispatcher(music);
    if (!dispatcher) return;

    MUSICKIT_EVENTS.forEach((event) => {
      const handler = (...args: unknown[]) => {
        log.debug(...args);
      };
      this.events.set(event, handler);
      dispatcher.subscribe(event, handler);
    });
  }

  public eject() {
    const music = this.music;
    if (!music) return;

    const dispatcher = getMusicKitAppDispatcher(music);
    if (!dispatcher) return;

    this.events.forEach((handler, event) => {
      dispatcher.unsubscribe(event, handler);
    });
    this.events.clear();
  }
}
