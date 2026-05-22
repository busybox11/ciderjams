import {
  INTERNAL_PLUGIN_QUEUE_SYNC_EVENTS,
  INTERNAL_PLUGIN_SUBSCRIBE_EVENTS,
  internalPluginEvents,
} from "../lib/events";
import type {
  ISharePlayHostAdapter,
  SharePlayHostAdapterHooks,
} from "./adapter";
import { getMusicKitAppDispatcher } from "./musickit-bridge";

import { createLogger } from "@ciderjams/proto";

const log = createLogger("plugin", "shareplay/host");

/** Item list changes only; index moves use PLAYBACK_SYNC_EVENTS → player.host.sync */
export const QUEUE_SYNC_EVENTS: string[] = ["queueItemsDidChange"];

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
  private readonly internalPluginEvents = new Map<
    string,
    (...args: unknown[]) => void
  >();
  private lastPlaybackSync = 0;
  private playbackSyncTimer: ReturnType<typeof setTimeout> | null = null;
  private hostStateSyncTimer: ReturnType<typeof setTimeout> | null = null;
  private hooks: SharePlayHostAdapterHooks = {};

  constructor(
    private readonly music: MusicKit.MusicKitInstanceLoose,
    private readonly options: SharePlayHostOptions = {},
  ) {}

  /** debounced host push */
  private triggerHostStateSync() {
    if (this.hostStateSyncTimer) clearTimeout(this.hostStateSyncTimer);
    this.hostStateSyncTimer = setTimeout(() => {
      this.hostStateSyncTimer = null;
      this.hooks.onSyncQueue?.() ?? this.options.onSyncQueue?.();
    }, 50);
  }

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
          log.debug("triggerHostStateSync (queue)");
          this.triggerHostStateSync();
        } else if (PLAYBACK_SYNC_EVENTS.includes(event)) {
          log.debug("triggerHostStateSync (playback)");
          this.triggerHostStateSync();
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

    // ew ugly ew but it works for now so dont criticise me or i will cry
    // thank u
    for (const event of INTERNAL_PLUGIN_SUBSCRIBE_EVENTS) {
      const handler = (..._args: unknown[]) => {
        log.debug("handleInternalPluginEvent", event, ..._args);

        if (INTERNAL_PLUGIN_QUEUE_SYNC_EVENTS.includes(event)) {
          log.debug("triggerHostStateSync (internal queue)");
          this.triggerHostStateSync();
        }
      };
      this.internalPluginEvents.set(event, handler);
      internalPluginEvents.addEventListener(event, handler);
    }
  }

  public eject() {
    if (this.hostStateSyncTimer) clearTimeout(this.hostStateSyncTimer);
    this.hostStateSyncTimer = null;
    if (this.playbackSyncTimer) clearTimeout(this.playbackSyncTimer);
    this.playbackSyncTimer = null;

    const dispatcher = getMusicKitAppDispatcher(this.music);
    if (!dispatcher) return;

    this.events.forEach((handler, event) => {
      dispatcher.unsubscribe(event, handler);
    });
    this.events.clear();

    for (const event of INTERNAL_PLUGIN_SUBSCRIBE_EVENTS) {
      internalPluginEvents.removeEventListener(
        event,
        this.internalPluginEvents.get(event) ?? null,
      );
      this.internalPluginEvents.delete(event);
    }
  }
}
