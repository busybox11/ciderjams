import { createLogger } from "@ciderjams/proto";
import { mockSharePlayData } from "./mock";
import {
  getMusicKitAppDispatcher,
  subscribeDispatcher,
  type MusicKitWithCiderSharePlay,
} from "./musickit-bridge";
import type { SharePlayPublishedMediaState, SharePlaySyncInput } from "./types";

export type { SharePlayPublishedMediaState, SharePlaySyncInput } from "./types";

const log = createLogger("plugin", "shareplay");

export interface SharePlayHooks {
  onInjected?: () => void;
  onEjected?: () => void;
  onMediaStatePublished?: (payload: SharePlayPublishedMediaState) => void;
}

export class SharePlayInhibitor {
  private originalMethods = new Map<
    string,
    { obj: unknown; prop: string; original: unknown }
  >();
  private music: MusicKitWithCiderSharePlay | null = null;
  private dispatcherCleanups: (() => void)[] = [];

  constructor(private readonly hooks: SharePlayHooks = {}) {}

  /** @returns false if MusicKit was not available */
  public inject(): boolean {
    log.debug("injecting");
    const mk = MusicKit.getInstance() as MusicKitWithCiderSharePlay | undefined;
    log.debug("music", mk);
    if (!mk) return false;
    this.music = mk;

    this.music._sharePlay = {
      id: "cider-jams-session",
      mediaState: {
        capabilities: {
          autoPlayControl: true,
          repeatControl: true,
          shuffleControl: true,
          volumeControl: true,
        },
      },
      participants: [
        { id: "1", name: "rain capsule" },
        { id: "2", name: "breyy" },
        { id: "3", name: "Hortense" },
      ],
      checkCapability: () => true,
      shouldUpdate: () => true,
      lastKnownElapsedTime: 0,
    };

    const playActivity = (mk as MusicKit.MusicKitInstance).services
      ?.playActivity as
      | { handleEvent?: (a: string, b: unknown) => unknown }
      | undefined;
    if (playActivity?.handleEvent) {
      const originalHandler = playActivity.handleEvent;
      playActivity.handleEvent = function (eventName: string, data: unknown) {
        try {
          log.debug("handleEvent", eventName, data);
          return originalHandler.apply(this, [eventName, data]);
        } catch {
          log.warn(`analytics suppressed for event: ${eventName}`);
          return;
        }
      };
    }

    this.music.playbackMode = 1; // MIXED_CONTENT
    this.music.autoplayEnabled = false;

    const dispatcher = getMusicKitAppDispatcher(this.music);
    if (dispatcher) {
      this.dispatcherCleanups.push(
        subscribeDispatcher(dispatcher, "sharePlay.nextItem", () =>
          log.debug("nextItem"),
        ),
        subscribeDispatcher(dispatcher, "sharePlay.previousItem", () =>
          log.debug("previousItem"),
        ),
      );
    }

    const forceSkip = async (
      original: (...args: unknown[]) => Promise<unknown>,
    ) => {
      log.debug("forceSkip");
      const m = this.music!;
      const prevMode = m.playbackMode;
      m.playbackMode = 1;
      await original();
      m.playbackMode = prevMode;
    };

    this.patch(this.music, "skipToNextItem", forceSkip);
    this.patch(this.music, "skipToPreviousItem", forceSkip);

    this.hooks.onInjected?.();

    log.debug("injected");
    return true;
  }

  /**
   * Remove all patches and restore original behavior
   */
  public eject() {
    log.debug("ejecting");
    this.originalMethods.forEach(({ obj, prop, original }, key) => {
      log.debug("restoring original method", key);
      (obj as Record<string, unknown>)[prop] = original;
    });
    this.originalMethods.clear();

    for (const dispose of this.dispatcherCleanups) dispose();
    this.dispatcherCleanups = [];

    const music = this.music;
    if (music) {
      music._sharePlay = undefined;
      music.playbackMode = 1; // MIXED_CONTENT
    }

    this.hooks.onEjected?.();

    log.debug("ejected");
  }

  private patch(
    obj: MusicKitWithCiderSharePlay,
    prop: "skipToNextItem" | "skipToPreviousItem",
    wrapper: (
      original: (...args: unknown[]) => Promise<unknown>,
      ...args: unknown[]
    ) => Promise<unknown>,
  ) {
    const original = (obj as Record<string, unknown>)[prop];
    if (typeof original !== "function") return;
    const key = `${(obj as { constructor?: { name?: string } }).constructor?.name ?? "object"}::${prop}`;
    this.originalMethods.set(key, { obj, prop, original });
    (obj as Record<string, unknown>)[prop] = (...args: unknown[]) =>
      wrapper(
        original.bind(obj) as (...a: unknown[]) => Promise<unknown>,
        ...args,
      );
  }

  public async syncFromServer(serverData: SharePlaySyncInput) {
    log.debug("syncFromServer", serverData);
    const music = this.music;
    if (!music) return;

    const playbackState = serverData.playbackState ?? serverData.state ?? 0;

    music.autoplayEnabled = false;

    const dedupedQueue = serverData.queue
      .map((item) => ({
        ...item,
        attributes: {
          ...item.attributes,
          playParams: {
            ...item.attributes.playParams,
            catalogId: item.id,
            reporting: true,
            reportingId: item.id,
          },
        },
      }))
      .filter(
        (item, index, self) =>
          self.findIndex((t) => t.id === item.id) === index,
      );

    const serverPlayingItemId =
      serverData.queue[serverData.index ?? serverData.currentPlayingIndex ?? 0]
        ?.id;
    const playingIndex = dedupedQueue.findIndex(
      (item) => item.id === serverPlayingItemId,
    );

    const instantiatedQueue = dedupedQueue.map(
      (item) => new MusicKit.MediaItem(item as never),
    );

    await music.stop();

    await music.setQueue({
      items: instantiatedQueue,
    });
    await music.changeToMediaAtIndex(playingIndex);

    const seekSeconds = (serverData.elapsedTime || 0) / 1000;

    if (music._sharePlay) {
      music._sharePlay.lastKnownElapsedTime = seekSeconds;
    }

    const resyncPlayback = async () => {
      await music.changeToMediaAtIndex(playingIndex);
      if (serverData.elapsedTime && serverData.elapsedTime > 0) {
        await music.seekToTime(seekSeconds);
      }
    };

    if (playbackState === 2) {
      try {
        await music.play();
        if (serverData.elapsedTime && serverData.elapsedTime > 0) {
          await music.seekToTime(seekSeconds);
        }
        if (music.nowPlayingItemIndex !== playingIndex) {
          log.warn("drift after play, re-pinning", playingIndex);
          await resyncPlayback();
        }
      } catch (e) {
        log.error("error playing", e);
      }
    }

    const payload: SharePlayPublishedMediaState = {
      autoPlay: serverData.autoPlay ?? true,
      nowPlayingItemIndex: playingIndex,
      queue: instantiatedQueue,
      playbackState,
      repeatMode: serverData.repeatMode ?? 0,
      shuffleMode: serverData.shuffleMode ?? 0,
      playbackElapsedTime: seekSeconds,
      volume: serverData.volume ?? 0.1,
    };

    const expectedSongId =
      instantiatedQueue[playingIndex]?.id != null
        ? String(instantiatedQueue[playingIndex].id)
        : "";

    const refocusIfWrongItem = async (phase: string) => {
      const np = music.nowPlayingItem;
      const got = np?.id != null ? String(np.id) : "";
      if (expectedSongId && got !== expectedSongId) {
        log.warn(
          `wrong nowPlaying (${phase}), got=${got}, want=${expectedSongId}`,
        );
        await resyncPlayback();
      }
      if (music.nowPlayingItemIndex !== playingIndex) {
        log.warn("index drift ", phase, music.nowPlayingItemIndex);
        await resyncPlayback();
      }
    };

    log.debug("publishing mediaStateUpdate", payload);
    const dispatcher = getMusicKitAppDispatcher(music);
    dispatcher?.publish("sharePlay.mediaStateUpdate", payload);
    this.hooks.onMediaStatePublished?.(payload);

    await refocusIfWrongItem("post-publish-sync");
    setTimeout(() => void refocusIfWrongItem("post-publish+50ms"), 50);

    log.debug("played");
    log.debug("elapsedTime", serverData.elapsedTime);
    log.debug("currentPlaybackTime", music.currentPlaybackTime);
  }

  public triggerMockSync() {
    log.debug("triggering mock sync");
    const parsed = JSON.parse(mockSharePlayData) as SharePlaySyncInput;
    void this.syncFromServer(parsed);
  }
}
