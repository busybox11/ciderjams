import type { CatalogItemId } from "@ciderjams/proto";

import { createLogger } from "@ciderjams/proto";

import { isSameCatalogIdMultiset, isSameCatalogIdOrder } from "../payloads";
import { patchMusicKitQueue } from "../runtime/queue-patch";

const log = createLogger("plugin", "musickit/queue/sync");

export type QueueApplyResult = {
  queueChanged: boolean;
  instantiatedQueue: MusicKit.MediaItem[];
  didApplyPlaybackPosition: boolean;
};

export function reorderMusicKitQueueByCatalogIds(
  music: MusicKit.MusicKitInstanceLoose,
  catalogIds: readonly string[],
): MusicKit.MediaItem[] | null {
  const byCatalogId = new Map<string, MusicKit.MediaItem>();
  for (const { item } of music.queue._queueItems) {
    const catalogId = item.attributes?.playParams?.catalogId ?? String(item.id);
    byCatalogId.set(catalogId, item);
  }

  const reordered: MusicKit.MediaItem[] = [];
  for (const catalogId of catalogIds) {
    const item = byCatalogId.get(catalogId);
    if (!item) return null;
    reordered.push(item);
  }
  return reordered;
}

export async function materializeMusicKitQueueFromCatalogIds(
  music: MusicKit.MusicKitInstanceLoose,
  catalogIds: readonly string[],
  isStale: () => boolean,
): Promise<MusicKit.MediaItem[]> {
  const existingQueue = music.queue._queueItems.map((item) => item.item);

  const instanciatedItemsMap = new Map<string, MusicKit.MediaItem>();
  const newItems: CatalogItemId[] = [];

  for (const catalogId of catalogIds) {
    const existingItem = existingQueue.find((existing) => existing.id === catalogId);
    if (existingItem) {
      instanciatedItemsMap.set(catalogId, existingItem);
    } else {
      newItems.push(catalogId);
    }
  }
  log.debug(
    "reusing existing items",
    existingQueue.map((item) => item.id),
  );

  log.debug("preloading new items", newItems);
  if (isStale()) return [];
  const instantiatedNewItems = await music.loadItems({ songs: newItems });
  if (isStale()) return [];
  log.debug(
    "instantiated new items",
    instantiatedNewItems.map((item) => item.id),
  );

  for (const newItem of instantiatedNewItems) {
    instanciatedItemsMap.set(newItem.id, newItem);
  }

  const instantiatedQueue: MusicKit.MediaItem[] = [];
  for (const catalogId of catalogIds) {
    const instantiatedItem = instanciatedItemsMap.get(catalogId);
    if (!instantiatedItem) {
      throw new Error(`instantiated item not found for queue item ${catalogId}`);
    }
    instantiatedQueue.push(instantiatedItem);
  }

  if (isStale()) return [];
  return instantiatedQueue;
}

export async function applyMusicKitQueueSnapshot(
  music: MusicKit.MusicKitInstanceLoose,
  instantiatedQueue: MusicKit.MediaItem[],
  playingIndex: number,
  isStale: () => boolean,
): Promise<QueueApplyResult | null> {
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
      if (isStale()) return null;
      await music.changeToMediaAtIndex(playingIndex);
      if (isStale()) return null;
      didApplyPlaybackPosition = true;
    }
    return {
      queueChanged: true,
      instantiatedQueue,
      didApplyPlaybackPosition,
    };
  }

  log.debug("queue not initiated, using setQueue");
  if (isStale()) return null;
  await music.setQueue({ items: instantiatedQueue });
  if (isStale()) return null;

  let didApplyPlaybackPosition = false;
  if (music.nowPlayingItemIndex !== playingIndex && playingIndex >= 0) {
    if (isStale()) return null;
    await music.changeToMediaAtIndex(playingIndex);
    if (isStale()) return null;
    didApplyPlaybackPosition = true;
  }

  return {
    queueChanged: true,
    instantiatedQueue,
    didApplyPlaybackPosition,
  };
}

export async function syncMusicKitQueueFromCatalogIds(
  music: MusicKit.MusicKitInstanceLoose,
  catalogIds: readonly string[],
  playingIndex: number,
  lastCatalogIds: string[] | null,
  isStale: () => boolean,
): Promise<(QueueApplyResult & { catalogIds: string[] }) | null> {
  const ids = [...catalogIds];

  if (lastCatalogIds && isSameCatalogIdOrder(lastCatalogIds, ids)) {
    log.debug("queue order unchanged, skipping queue sync");
    return {
      queueChanged: false,
      instantiatedQueue: music.queue._queueItems.map((item) => item.item),
      didApplyPlaybackPosition: false,
      catalogIds: ids,
    };
  }

  const reorderOnly = !!lastCatalogIds && isSameCatalogIdMultiset(lastCatalogIds, ids);

  let instantiatedQueue: MusicKit.MediaItem[];
  if (reorderOnly) {
    const reordered = reorderMusicKitQueueByCatalogIds(music, ids);
    if (reordered) {
      instantiatedQueue = reordered;
    } else {
      log.debug("reorder fallback → materialize queue");
      if (isStale()) return null;
      instantiatedQueue = await materializeMusicKitQueueFromCatalogIds(music, ids, isStale);
      if (isStale()) return null;
    }
  } else {
    if (isStale()) return null;
    instantiatedQueue = await materializeMusicKitQueueFromCatalogIds(music, ids, isStale);
    if (isStale()) return null;
  }

  if (reorderOnly) {
    log.debug(
      "queue reorder only",
      instantiatedQueue.map((item) => item.id),
    );
  } else {
    log.debug("materializing queue from catalog ids", ids);
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

  const applied = await applyMusicKitQueueSnapshot(music, instantiatedQueue, playingIndex, isStale);
  if (!applied) return null;

  return { ...applied, catalogIds: ids };
}
