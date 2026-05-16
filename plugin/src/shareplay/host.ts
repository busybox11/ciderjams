import { getMusicKitAppDispatcher } from "./musickit-bridge";
import type { ISharePlayHostAdapter, SharePlayHostAdapterHooks } from "./adapter";

import { createLogger } from "@ciderjams/proto";

const log = createLogger("plugin", "shareplay/host");

export const QUEUE_SYNC_EVENTS: string[] = [
  "queueItemsDidChange",
  // "queueModified",
];

export const PLAYBACK_TIME_EVENTS: string[] = ["playbackTimeDidChange"];

export const PLAYBACK_SYNC_EVENTS: string[] = [
  "nowPlayingItemWillChange",
  "nowPlayingItemDidChange",
  "queuePositionDidChange",
  "playbackStateDidChange",
  "playbackPlay",
  "playbackPause",
  "playbackStop",
  "playbackSeek",
  "playbackScrub",
  "playbackSkip",
  "repeatModeDidChange",
  "shuffleModeDidChange",
  "autoplayEnabledDidChange",
  "playerActivate",
  "playerExit",
];

const MK_SUBSCRIBE_EVENTS: string[] = [
  ...QUEUE_SYNC_EVENTS,
  ...PLAYBACK_TIME_EVENTS,
  ...PLAYBACK_SYNC_EVENTS,
];

export type SharePlayHostOptions = {
  // deprecated, moved to inject() hooks
  onSyncQueue?: () => void;
  onSyncPlayback?: () => void;
};

export class SharePlayHost implements ISharePlayHostAdapter {
  private readonly events = new Map<string, (...args: unknown[]) => void>();
  private lastPlaybackSync = 0;
  private playbackSyncTimer: ReturnType<typeof setTimeout> | null = null;
  private hooks: SharePlayHostAdapterHooks = {};

  constructor(
    private readonly music: MusicKit.MusicKitInstanceLoose,
    private readonly options: SharePlayHostOptions = {},
  ) {}

  private triggerPlaybackSync() {
    if (this.playbackSyncTimer) return;
    this.playbackSyncTimer = setTimeout(() => {
      this.hooks.onSyncPlayback?.() ?? this.options.onSyncPlayback?.();
      this.lastPlaybackSync = Date.now();
      this.playbackSyncTimer = null;
    }, 50);
  }

  public inject(hooks?: SharePlayHostAdapterHooks) {
    if (hooks) {
      this.hooks = hooks;
    }

    const dispatcher = getMusicKitAppDispatcher(this.music);
    if (!dispatcher) return;

    for (const event of MK_SUBSCRIBE_EVENTS) {
      const handler = (..._args: unknown[]) => {
        // log.debug("handleEvent", event, ..._args);

        if (QUEUE_SYNC_EVENTS.includes(event)) {
          log.debug("triggerQueueSync");
          this.hooks.onSyncQueue?.() ?? this.options.onSyncQueue?.();
        } else if (PLAYBACK_SYNC_EVENTS.includes(event)) {
          log.debug("triggerPlaybackSync");
          this.triggerPlaybackSync();
        } else if (PLAYBACK_TIME_EVENTS.includes(event)) {
          const now = Date.now();
          if (now - this.lastPlaybackSync >= 10000) {
            log.debug("triggerPlaybackSync (time)");
            this.triggerPlaybackSync();
          }
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
