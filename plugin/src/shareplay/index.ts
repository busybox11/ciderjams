import { CatalogItemId, createLogger } from "@ciderjams/proto";
import type {
  ISharePlayGuestAdapter,
  SharePlayGuestAdapterHooks,
} from "./adapter";
import { mockSharePlayData } from "./mock";
import {
  getMusicKitAppDispatcher,
  subscribeDispatcher,
  type MusicKitWithCiderSharePlay,
} from "./musickit-bridge";
import type { SharePlayPublishedMediaState, SharePlaySyncInput } from "./types";

export * from "./adapter";
export type { SharePlayPublishedMediaState, SharePlaySyncInput } from "./types";

const log = createLogger("plugin", "shareplay");

export interface SharePlayHooks {
  onInjected?: () => void;
  onEjected?: () => void;
  onMediaStatePublished?: (payload: SharePlayPublishedMediaState) => void;
}

export class SharePlayInhibitor implements ISharePlayGuestAdapter {
  private originalMethods = new Map<
    string,
    { obj: unknown; prop: string; original: unknown }
  >();
  private music: MusicKitWithCiderSharePlay | null = null;
  private dispatcherCleanups: (() => void)[] = [];
  private currentHooks: SharePlayGuestAdapterHooks;
  private lastServerQueueIds: string[] | null = null;
  private applyingServerSync = false;
  private suppressGuestActionsUntil = 0;

  constructor(private readonly hooks: SharePlayHooks = {}) {
    this.currentHooks = hooks;
  }

  /** @returns false if MusicKit was not available */
  public inject(hooks?: SharePlayGuestAdapterHooks): boolean {
    if (hooks) {
      this.currentHooks = hooks;
    }
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
          // log.debug("handleEvent", eventName, data);
          return originalHandler.apply(this, [eventName, data]);
        } catch {
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

    this.currentHooks.onInjected?.() ?? this.hooks.onInjected?.();

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
    this.lastServerQueueIds = null;

    const music = this.music;
    if (music) {
      music._sharePlay = undefined;
      music.playbackMode = 1; // MIXED_CONTENT
    }

    this.currentHooks.onEjected?.() ?? this.hooks.onEjected?.();

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

    this.applyingServerSync = true;
    this.suppressGuestActionsUntil = Date.now() + 750;
    try {
      await this.applyServerSync(music, serverData);
    } finally {
      this.suppressGuestActionsUntil = Date.now() + 750;
      this.applyingServerSync = false;
    }
  }

  public isSuppressingGuestActions(): boolean {
    return (
      this.applyingServerSync || Date.now() < this.suppressGuestActionsUntil
    );
  }

  private getQueueCatalogIds(queue: SharePlaySyncInput["queue"]): string[] {
    return queue.map(
      (item) => item.attributes?.playParams?.catalogId ?? item.id,
    );
  }

  private dedupeServerQueue(
    queue: SharePlaySyncInput["queue"],
  ): SharePlaySyncInput["queue"] {
    return queue
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
  }

  private async applyServerSyncQueue(
    music: MusicKitWithCiderSharePlay,
    dedupedQueue: SharePlaySyncInput["queue"],
    playingIndex: number,
  ): Promise<{
    queueChanged: boolean;
    instantiatedQueue: MusicKit.MediaItem[];
    didApplyPlaybackPosition: boolean;
  }> {
    const catalogIds = this.getQueueCatalogIds(dedupedQueue);
    if (
      this.lastServerQueueIds &&
      this.lastServerQueueIds.length === catalogIds.length &&
      this.lastServerQueueIds.every((id, i) => id === catalogIds[i])
    ) {
      log.debug("queue catalogIds unchanged, skipping setQueue");
      return {
        queueChanged: false,
        instantiatedQueue: music.queue._queueItems.map((item) => item.item),
        didApplyPlaybackPosition: false,
      };
    }

    this.lastServerQueueIds = catalogIds;

    log.debug(
      "preloading room queue MediaItem instances with metadata",
      dedupedQueue,
    );
    const instantiatedQueue = await this.instantiateQueue(music, dedupedQueue);

    log.assert(
      instantiatedQueue.every((item) => item.attributes.playParams.catalogId),
      "preloaded tracks have catalogId",
      instantiatedQueue,
    );
    log.assert(
      instantiatedQueue.every((item) => item.attributes.name),
      "preloaded tracks have name",
      instantiatedQueue,
    );
    log.debug("preloaded queue MediaItem instances", instantiatedQueue);

    let didApplyPlaybackPosition = false;
    if (music.nowPlayingItemIndex !== playingIndex) {
      log.assert(
        false,
        "queue changed, stopping",
        music.nowPlayingItemIndex,
        playingIndex,
      );
      await music.stop();
      didApplyPlaybackPosition = true;
    }

    await music.setQueue({
      items: instantiatedQueue,
    });

    if (music.nowPlayingItemIndex !== playingIndex) {
      log.assert(
        false,
        "queue changed, changing to index",
        music.nowPlayingItemIndex,
        playingIndex,
      );
      await music.changeToMediaAtIndex(playingIndex);
      didApplyPlaybackPosition = true;
    }

    return {
      queueChanged: true,
      instantiatedQueue,
      didApplyPlaybackPosition,
    };
  }

  private async instantiateQueue(
    music: MusicKitWithCiderSharePlay,
    queue: SharePlaySyncInput["queue"],
  ): Promise<MusicKit.MediaItem[]> {
    const existingQueue = music.queue._queueItems.map((item) => item.item);

    // create map of instantiated items by catalogId
    let instanciatedItemsMap = new Map<string, MusicKit.MediaItem>();
    let newItems: CatalogItemId[] = [];

    for (const item of queue) {
      const existingItem = existingQueue.find((existing) => existing.id === item.attributes?.playParams?.catalogId);
      if (existingItem) {
        instanciatedItemsMap.set(item.attributes?.playParams?.catalogId ?? item.id, existingItem);
      } else {
        newItems.push(item.attributes?.playParams?.catalogId ?? item.id);
      }
    }
    log.debug("reusing existing items", existingQueue.map((item) => item.id));

    // uses undocumented internal MusicKitInstance.loadItems method
    // preload instanciated items with full metadata into the queue
    // prevents cider from showing empty tracks, also causing unexpected internal broken states
    log.debug("preloading new items", newItems);
    const instantiatedNewItems = await music.loadItems({
      songs: newItems,
    });
    log.debug("instantiated new items", instantiatedNewItems.map((item) => item.id));

    // merge instantiated new items with existing queue
    let instantiatedQueue: MusicKit.MediaItem[] = [];
    for (const newItem of instantiatedNewItems) {
      instanciatedItemsMap.set(newItem.id, newItem);
    }

    for (const newQueueItem of queue) {
      const qId = newQueueItem.attributes?.playParams?.catalogId ?? newQueueItem.id;

      const instantiatedItem = instanciatedItemsMap.get(qId);
      if (!instantiatedItem) throw new Error(`instantiated item not found for queue item ${qId}`);
      
      instantiatedQueue.push(instantiatedItem);
    }
  
    return instantiatedQueue;
  }

  private async applyServerSync(
    music: MusicKitWithCiderSharePlay,
    serverData: SharePlaySyncInput,
  ) {
    // TODO: big overhaul, proper diffing
    // this can be called multiple times in a row
    // as a result we sometimes hit a race condition where we fetch/manipulate state
    // a lot of times in parallel
    // should be deduped / batched / debounced
    log.debug("applyServerSync", serverData);

    const playbackState = serverData.playbackState ?? serverData.state ?? 0;

    music.autoplayEnabled = false;

    const dedupedQueue = this.dedupeServerQueue(serverData.queue);
    if (dedupedQueue.length === 0) {
      // empty jam state, properly clear musickit
      log.debug("jam is empty, stopping local player");
      music.clearQueue();
      music.stop();
      return;
    }

    const serverPlayingItemId =
      serverData.queue[serverData.index ?? serverData.currentPlayingIndex ?? 0]
        ?.id;
    const playingIndex = dedupedQueue.findIndex(
      (item) => item.id === serverPlayingItemId,
    );

    const {
      queueChanged,
      instantiatedQueue,
      didApplyPlaybackPosition: queueAppliedPosition,
    } = await this.applyServerSyncQueue(music, dedupedQueue, playingIndex);

    const seekSeconds = (serverData.elapsedTime || 0) / 1000;
    if (music._sharePlay) {
      music._sharePlay.lastKnownElapsedTime = seekSeconds;
    }

    const resyncPlayback = async () => {
      if (music.nowPlayingItemIndex !== playingIndex) {
        await music.changeToMediaAtIndex(playingIndex);
      }
      if (serverData.elapsedTime && serverData.elapsedTime > 0) {
        await music.seekToTime(seekSeconds);
      }
    };

    let didApplyPlaybackPosition = queueAppliedPosition;
    if (!queueChanged && music.nowPlayingItemIndex !== playingIndex) {
      await resyncPlayback();
      didApplyPlaybackPosition = true;
    } else if (
      serverData.elapsedTime != null &&
      Math.abs((music.currentPlaybackTime ?? 0) - seekSeconds) > 2
    ) {
      await music.seekToTime(seekSeconds);
      didApplyPlaybackPosition = true;
    }

    if (playbackState === 2) {
      try {
        await music.play();
        if (
          didApplyPlaybackPosition &&
          serverData.elapsedTime &&
          serverData.elapsedTime > 0
        ) {
          await music.seekToTime(seekSeconds);
        }
        if (music.nowPlayingItemIndex !== playingIndex) {
          log.warn("drift after play, re-pinning", playingIndex);
          await resyncPlayback();
        }
      } catch (e) {
        log.error("error playing", e);
      }
    } else if (!queueChanged && typeof music.pause === "function") {
      await music.pause();
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
    this.currentHooks.onMediaStatePublished?.(payload) ??
      this.hooks.onMediaStatePublished?.(payload);

    await refocusIfWrongItem("post-publish-sync");
    setTimeout(() => void refocusIfWrongItem("post-publish+50ms"), 50);

    log.debug("server data", serverData);
  }

  public triggerMockSync() {
    log.debug("triggering mock sync");
    const parsed = JSON.parse(mockSharePlayData) as SharePlaySyncInput;
    void this.syncFromServer(parsed);
  }
}
