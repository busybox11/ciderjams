import type { ISharePlayGuestAdapter, SharePlayGuestAdapterHooks } from "./adapter";
import type { SharePlayPublishedMediaState, SharePlaySyncInput } from "./types";

import { type CatalogItemId, createLogger } from "@ciderjams/proto";

import { mockSharePlayData } from "./mock";
import {
  getMusicKitAppDispatcher,
  type MusicKitWithCiderSharePlay,
  patchMusicKitQueue,
  subscribeDispatcher,
} from "./musickit-bridge";

export type { SharePlayPublishedMediaState, SharePlaySyncInput } from "./types";

export * from "./adapter";

const log = createLogger("plugin", "shareplay");

export interface SharePlayHooks {
  onInjected?: () => void;
  onEjected?: () => void;
  onMediaStatePublished?: (payload: SharePlayPublishedMediaState) => void;
}

export class SharePlayInhibitor implements ISharePlayGuestAdapter {
  private originalMethods = new Map<string, { obj: unknown; prop: string; original: unknown }>();
  private music: MusicKitWithCiderSharePlay | null = null;
  private dispatcherCleanups: (() => void)[] = [];
  private currentHooks: SharePlayGuestAdapterHooks;
  private lastServerQueueIds: string[] | null = null;
  private applyingServerSync = false;
  private suppressGuestActionsUntil = 0;
  private syncGeneration = 0;

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

    const playActivity = (mk as MusicKit.MusicKitInstance).services?.playActivity as
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
        subscribeDispatcher(dispatcher, "sharePlay.nextItem", () => log.debug("nextItem")),
        subscribeDispatcher(dispatcher, "sharePlay.previousItem", () => log.debug("previousItem")),
      );
    }

    const music = this.music;
    const forceSkip = async (original: (...args: unknown[]) => Promise<unknown>) => {
      log.debug("forceSkip");
      const prevMode = music.playbackMode;
      music.playbackMode = 1;
      await original();
      music.playbackMode = prevMode;
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
    this.syncGeneration++;

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
      wrapper(original.bind(obj) as (...a: unknown[]) => Promise<unknown>, ...args);
  }

  private isStaleSync(gen: number): boolean {
    return gen !== this.syncGeneration;
  }

  public async syncFromServer(serverData: SharePlaySyncInput) {
    log.debug("syncFromServer", serverData);
    const music = this.music;
    if (!music) return;

    const gen = ++this.syncGeneration;
    this.applyingServerSync = true;
    this.suppressGuestActionsUntil = Date.now() + 750;
    try {
      await this.applyServerSync(music, serverData, gen);
    } finally {
      if (gen === this.syncGeneration) {
        this.suppressGuestActionsUntil = Date.now() + 750;
      }
      this.applyingServerSync = false;
    }
  }

  public isSuppressingGuestActions(): boolean {
    return this.applyingServerSync || Date.now() < this.suppressGuestActionsUntil;
  }

  /** Ignore local MusicKit control events while applying server state. */
  public bumpGuestActionSuppress(durationMs = 750): void {
    this.suppressGuestActionsUntil = Math.max(
      this.suppressGuestActionsUntil,
      Date.now() + durationMs,
    );
  }

  private getQueueCatalogIds(queue: SharePlaySyncInput["queue"]): string[] {
    return queue.map((item) => item.attributes?.playParams?.catalogId ?? item.id);
  }

  private isSameQueueOrder(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every((id, i) => id === b[i]);
  }

  private isSameQueueItems(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((id, i) => id === sortedB[i]);
  }

  private dedupeServerQueue(queue: SharePlaySyncInput["queue"]): SharePlaySyncInput["queue"] {
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
      .filter((item, index, self) => self.findIndex((t) => t.id === item.id) === index);
  }

  private async applyServerSyncQueue(
    music: MusicKitWithCiderSharePlay,
    dedupedQueue: SharePlaySyncInput["queue"],
    playingIndex: number,
    gen: number,
  ): Promise<{
    queueChanged: boolean;
    instantiatedQueue: MusicKit.MediaItem[];
    didApplyPlaybackPosition: boolean;
  } | null> {
    const catalogIds = this.getQueueCatalogIds(dedupedQueue);
    if (this.lastServerQueueIds && this.isSameQueueOrder(this.lastServerQueueIds, catalogIds)) {
      log.debug("queue order unchanged, skipping queue sync");
      return {
        queueChanged: false,
        instantiatedQueue: music.queue._queueItems.map((item) => item.item),
        didApplyPlaybackPosition: false,
      };
    }

    const priorQueueIds = this.lastServerQueueIds;
    const reorderOnly = !!priorQueueIds && this.isSameQueueItems(priorQueueIds, catalogIds);

    let instantiatedQueue: MusicKit.MediaItem[];
    if (reorderOnly) {
      const reordered = this.reorderInstantiatedQueue(music, dedupedQueue);
      if (reordered) {
        instantiatedQueue = reordered;
      } else {
        log.debug("reorder fallback → instantiateQueue");
        if (this.isStaleSync(gen)) return null;
        instantiatedQueue = await this.instantiateQueue(music, dedupedQueue, gen);
        if (this.isStaleSync(gen)) return null;
      }
    } else {
      if (this.isStaleSync(gen)) return null;
      instantiatedQueue = await this.instantiateQueue(music, dedupedQueue, gen);
      if (this.isStaleSync(gen)) return null;
    }

    if (reorderOnly) {
      log.debug(
        "queue reorder only",
        instantiatedQueue.map((item) => item.id),
      );
    } else {
      log.debug("preloading room queue MediaItem instances with metadata", dedupedQueue);
    }

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

    const targetPlayingId = instantiatedQueue[playingIndex]?.id;
    const currentPlayingId = music.nowPlayingItem?.id;
    const canPatchInPlace =
      music.queue.isInitiated && music.queue.length > 0 && (music.nowPlayingItemIndex ?? -1) >= 0;

    if (canPatchInPlace) {
      log.debug("patching queue in place (updateItems)", { playingIndex });
      const { didMovePosition } = patchMusicKitQueue(music.queue, instantiatedQueue, playingIndex);
      let didApplyPlaybackPosition = didMovePosition;
      if (targetPlayingId && currentPlayingId !== targetPlayingId && playingIndex >= 0) {
        log.debug("server now-playing changed, changeToMediaAtIndex", {
          from: currentPlayingId,
          to: targetPlayingId,
          playingIndex,
        });
        if (this.isStaleSync(gen)) return null;
        await music.changeToMediaAtIndex(playingIndex);
        if (this.isStaleSync(gen)) return null;
        didApplyPlaybackPosition = true;
      }
      this.lastServerQueueIds = catalogIds;
      return {
        queueChanged: true,
        instantiatedQueue,
        didApplyPlaybackPosition,
      };
    }

    log.debug("queue not initiated, using setQueue");
    if (this.isStaleSync(gen)) return null;
    await music.setQueue({
      items: instantiatedQueue,
    });
    if (this.isStaleSync(gen)) return null;

    let didApplyPlaybackPosition = false;
    if (music.nowPlayingItemIndex !== playingIndex && playingIndex >= 0) {
      if (this.isStaleSync(gen)) return null;
      await music.changeToMediaAtIndex(playingIndex);
      if (this.isStaleSync(gen)) return null;
      didApplyPlaybackPosition = true;
    }

    this.lastServerQueueIds = catalogIds;
    return {
      queueChanged: true,
      instantiatedQueue,
      didApplyPlaybackPosition,
    };
  }

  private reorderInstantiatedQueue(
    music: MusicKitWithCiderSharePlay,
    queue: SharePlaySyncInput["queue"],
  ): MusicKit.MediaItem[] | null {
    const byCatalogId = new Map<string, MusicKit.MediaItem>();
    for (const { item } of music.queue._queueItems) {
      const catalogId = item.attributes?.playParams?.catalogId ?? String(item.id);
      byCatalogId.set(catalogId, item);
    }

    const reordered: MusicKit.MediaItem[] = [];
    for (const row of queue) {
      const catalogId = row.attributes?.playParams?.catalogId ?? row.id;
      const item = byCatalogId.get(catalogId);
      if (!item) return null;
      reordered.push(item);
    }
    return reordered;
  }

  private async instantiateQueue(
    music: MusicKitWithCiderSharePlay,
    queue: SharePlaySyncInput["queue"],
    gen: number,
  ): Promise<MusicKit.MediaItem[]> {
    const existingQueue = music.queue._queueItems.map((item) => item.item);

    // create map of instantiated items by catalogId
    const instanciatedItemsMap = new Map<string, MusicKit.MediaItem>();
    const newItems: CatalogItemId[] = [];

    for (const item of queue) {
      const existingItem = existingQueue.find(
        (existing) => existing.id === item.attributes?.playParams?.catalogId,
      );
      if (existingItem) {
        instanciatedItemsMap.set(item.attributes?.playParams?.catalogId ?? item.id, existingItem);
      } else {
        newItems.push(item.attributes?.playParams?.catalogId ?? item.id);
      }
    }
    log.debug(
      "reusing existing items",
      existingQueue.map((item) => item.id),
    );

    // uses undocumented internal MusicKitInstance.loadItems method
    // preload instanciated items with full metadata into the queue
    // prevents cider from showing empty tracks, also causing unexpected internal broken states
    log.debug("preloading new items", newItems);
    if (this.isStaleSync(gen)) return [];
    const instantiatedNewItems = await music.loadItems({
      songs: newItems,
    });
    if (this.isStaleSync(gen)) return [];
    log.debug(
      "instantiated new items",
      instantiatedNewItems.map((item) => item.id),
    );

    // merge instantiated new items with existing queue
    const instantiatedQueue: MusicKit.MediaItem[] = [];
    for (const newItem of instantiatedNewItems) {
      instanciatedItemsMap.set(newItem.id, newItem);
    }

    for (const newQueueItem of queue) {
      const qId = newQueueItem.attributes?.playParams?.catalogId ?? newQueueItem.id;

      const instantiatedItem = instanciatedItemsMap.get(qId);
      if (!instantiatedItem) throw new Error(`instantiated item not found for queue item ${qId}`);

      instantiatedQueue.push(instantiatedItem);
    }

    if (this.isStaleSync(gen)) return [];
    return instantiatedQueue;
  }

  private async applyServerSync(
    music: MusicKitWithCiderSharePlay,
    serverData: SharePlaySyncInput,
    gen: number,
  ) {
    log.debug("applyServerSync", serverData);

    const playbackState = serverData.playbackState ?? serverData.state ?? 0;

    music.autoplayEnabled = false;

    const dedupedQueue = this.dedupeServerQueue(serverData.queue);
    // maybe causes internal musickit state mismatch on resume
    // probably due to stopping the player if not already initialized with tracks?
    // will be caught by playback state guard
    if (dedupedQueue.length === 0 && (music.isPlaying || music.nowPlayingItemIndex !== -1)) {
      // empty jam state, properly clear musickit
      log.debug("jam is empty, stopping local player");
      music.clearQueue();
      music.stop();
      return;
    }

    const serverPlayingItemId =
      serverData.queue[serverData.index ?? serverData.currentPlayingIndex ?? 0]?.id;
    const playingIndex = dedupedQueue.findIndex((item) => item.id === serverPlayingItemId);

    const queueResult = await this.applyServerSyncQueue(music, dedupedQueue, playingIndex, gen);
    if (!queueResult || this.isStaleSync(gen)) return;

    const {
      queueChanged,
      instantiatedQueue,
      didApplyPlaybackPosition: queueAppliedPosition,
    } = queueResult;

    const seekSeconds = (serverData.elapsedTime || 0) / 1000;
    if (music._sharePlay) {
      music._sharePlay.lastKnownElapsedTime = seekSeconds;
    }

    const resyncPlayback = async () => {
      if (this.isStaleSync(gen)) return;
      if (music.nowPlayingItemIndex !== playingIndex) {
        await music.changeToMediaAtIndex(playingIndex);
        if (this.isStaleSync(gen)) return;
      }
      if (serverData.elapsedTime && serverData.elapsedTime > 0) {
        await music.seekToTime(seekSeconds);
        if (this.isStaleSync(gen)) return;
      }
    };

    let didApplyPlaybackPosition = queueAppliedPosition;
    if (!queueChanged && music.nowPlayingItemIndex !== playingIndex) {
      if (this.isStaleSync(gen)) return;
      await resyncPlayback();
      if (this.isStaleSync(gen)) return;
      didApplyPlaybackPosition = true;
    } else if (
      serverData.elapsedTime != null &&
      Math.abs((music.currentPlaybackTime ?? 0) - seekSeconds) > 2
    ) {
      if (this.isStaleSync(gen)) return;
      await music.seekToTime(seekSeconds);
      if (this.isStaleSync(gen)) return;
      didApplyPlaybackPosition = true;
    }

    if (playbackState === 2) {
      try {
        if (this.isStaleSync(gen)) return;
        if (!music.isPlaying) await music.play();
        if (this.isStaleSync(gen)) return;
        if (didApplyPlaybackPosition && serverData.elapsedTime && serverData.elapsedTime > 0) {
          await music.seekToTime(seekSeconds);
          if (this.isStaleSync(gen)) return;
        }
        if (music.nowPlayingItemIndex !== playingIndex) {
          log.warn("drift after play, re-pinning", playingIndex);
          await resyncPlayback();
          if (this.isStaleSync(gen)) return;
        }
      } catch (e) {
        log.error("error playing", e);
      }
    } else if (!queueChanged && typeof music.pause === "function") {
      if (this.isStaleSync(gen)) return;
      await music.pause();
      if (this.isStaleSync(gen)) return;
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
      instantiatedQueue[playingIndex]?.id != null ? String(instantiatedQueue[playingIndex].id) : "";

    const refocusIfWrongItem = async (phase: string) => {
      if (this.isStaleSync(gen)) return;
      const np = music.nowPlayingItem;
      const got = np?.id != null ? String(np.id) : "";
      if (expectedSongId && got !== expectedSongId) {
        log.warn(`wrong nowPlaying (${phase}), got=${got}, want=${expectedSongId}`);
        await resyncPlayback();
        if (this.isStaleSync(gen)) return;
      }
      if (music.nowPlayingItemIndex !== playingIndex) {
        log.warn("index drift ", phase, music.nowPlayingItemIndex);
        await resyncPlayback();
        if (this.isStaleSync(gen)) return;
      }
    };

    if (this.isStaleSync(gen)) return;

    log.debug("publishing mediaStateUpdate", payload);
    const dispatcher = getMusicKitAppDispatcher(music);
    dispatcher?.publish("sharePlay.mediaStateUpdate", payload);
    this.currentHooks.onMediaStatePublished?.(payload) ??
      this.hooks.onMediaStatePublished?.(payload);

    await refocusIfWrongItem("post-publish-sync");
    setTimeout(() => {
      if (this.isStaleSync(gen)) return;
      void refocusIfWrongItem("post-publish+50ms");
    }, 50);

    log.debug("server data", serverData);
  }

  public triggerMockSync() {
    log.debug("triggering mock sync");
    const parsed = JSON.parse(mockSharePlayData) as SharePlaySyncInput;
    void this.syncFromServer(parsed);
  }
}
