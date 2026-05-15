import { getMusicKitAppDispatcher } from "./musickit-bridge";

import { createLogger } from "@ciderjams/proto";

const log = createLogger("plugin", "shareplay/host");

export const MK_QUEUE_EVENTS: string[] = [
  "queueItemsDidChange",
  // "queueModified",
];

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

const MK_SUBSCRIBE_EVENTS: string[] = [
  ...MK_QUEUE_EVENTS,
  ...MK_PLAYBACK_EVENTS,
];

export type SharePlayHostOptions = {
  onQueueSync?: () => void;
  onPlaybackEvent?: (event: string, ...args: unknown[]) => void;
};

export class SharePlayHost {
  private readonly events = new Map<string, (...args: unknown[]) => void>();

  constructor(
    private readonly music: MusicKit.MusicKitInstanceLoose,
    private readonly options: SharePlayHostOptions = {},
  ) {}

  public inject() {
    const dispatcher = getMusicKitAppDispatcher(this.music);
    if (!dispatcher) return;

    for (const event of MK_SUBSCRIBE_EVENTS) {
      const handler = (...args: unknown[]) => {
        log.debug("handleEvent", event, ...args);
        if (MK_QUEUE_EVENTS.includes(event)) {
          this.options.onQueueSync?.();
        } else {
          this.options.onPlaybackEvent?.(event, ...args);
        }
      };
      this.events.set(event, handler);
      dispatcher.subscribe(event, handler);
    }
  }

  public eject() {
    const dispatcher = getMusicKitAppDispatcher(this.music);
    if (!dispatcher) return;

    this.events.forEach((handler, event) => {
      dispatcher.unsubscribe(event, handler);
    });
    this.events.clear();
  }
}
