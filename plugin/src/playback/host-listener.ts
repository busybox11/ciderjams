import type { ISharePlayHostAdapter, SharePlayHostAdapterHooks } from "./adapter";

import { createLogger } from "@ciderjams/proto";

import {
  INTERNAL_PLUGIN_QUEUE_SYNC_EVENTS,
  INTERNAL_PLUGIN_SUBSCRIBE_EVENTS,
  internalPluginEvents,
} from "../cider/events";
import { subscribeMusicKitEvent } from "./bridge";

const log = createLogger("plugin", "shareplay/host");

/** Item list changes only; index moves use PLAYBACK_SYNC_EVENTS → player.host.sync */
export const QUEUE_SYNC_EVENTS: string[] = ["queueItemsDidChange", "queuePositionDidChange"];

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
  private readonly eventCleanups: (() => void)[] = [];
  private readonly internalPluginEvents = new Map<string, (...args: unknown[]) => void>();
  private lastPlaybackSync = 0;
  private playbackSyncTimer: ReturnType<typeof setTimeout> | null = null;
  private hostStateSyncTimer: ReturnType<typeof setTimeout> | null = null;
  private hooks: SharePlayHostAdapterHooks = {};
  private suppressOutgoingPlaybackSyncUntil = 0;

  constructor(
    private readonly music: MusicKit.MusicKitInstanceLoose,
    private readonly options: SharePlayHostOptions = {},
  ) {}

  /** skip playback pushes while applying server-driven play/pause locally */
  public suppressOutgoingPlaybackSync(durationMs = 750): void {
    this.suppressOutgoingPlaybackSyncUntil = Date.now() + durationMs;
    if (this.playbackSyncTimer) clearTimeout(this.playbackSyncTimer);
    this.playbackSyncTimer = null;
  }

  private isSuppressingOutgoingPlaybackSync(): boolean {
    return Date.now() < this.suppressOutgoingPlaybackSyncUntil;
  }

  /** debounced queue push — never suppressed so reorders always reach the server */
  private triggerHostStateSync() {
    if (this.hostStateSyncTimer) clearTimeout(this.hostStateSyncTimer);
    this.hostStateSyncTimer = setTimeout(() => {
      this.hostStateSyncTimer = null;
      this.hooks.onSyncQueue?.() ?? this.options.onSyncQueue?.();
    }, 50);
  }

  private triggerPlaybackSync() {
    if (this.isSuppressingOutgoingPlaybackSync()) return;
    if (this.playbackSyncTimer) clearTimeout(this.playbackSyncTimer);
    this.playbackSyncTimer = setTimeout(() => {
      this.playbackSyncTimer = null;
      if (this.isSuppressingOutgoingPlaybackSync()) return;
      this.hooks.onSyncPlayback?.() ?? this.options.onSyncPlayback?.();
      this.lastPlaybackSync = Date.now();
    }, 50);
  }

  public inject(hooks?: SharePlayHostAdapterHooks) {
    if (hooks) {
      this.hooks = hooks;
    }

    for (const event of MK_SUBSCRIBE_EVENTS) {
      const handler = (..._args: unknown[]) => {
        // log.debug("handleEvent", event, ..._args);

        if (QUEUE_SYNC_EVENTS.includes(event)) {
          log.debug("triggerHostStateSync (queue)");
          this.triggerHostStateSync();
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
      this.eventCleanups.push(subscribeMusicKitEvent(this.music, event, handler));
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

    for (const dispose of this.eventCleanups) dispose();
    this.eventCleanups.length = 0;

    for (const event of INTERNAL_PLUGIN_SUBSCRIBE_EVENTS) {
      internalPluginEvents.removeEventListener(event, this.internalPluginEvents.get(event) ?? null);
      this.internalPluginEvents.delete(event);
    }
  }
}
