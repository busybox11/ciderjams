import type { SharePlaySyncInput, SharePlaySyncQueueRow } from "@ciderjams/proto";

export function sharePlayQueueCatalogIds(queue: readonly SharePlaySyncQueueRow[]): string[] {
  return queue.map((item) => {
    const catalogId = item.attributes?.playParams?.catalogId;
    return typeof catalogId === "string" ? catalogId : item.id;
  });
}

/** ensure catalogId/playParams, drop duplicate row ids */
export function normalizeSharePlaySyncQueue(
  queue: SharePlaySyncQueueRow[],
): SharePlaySyncQueueRow[] {
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

export function resolveSharePlayPlayingIndex(
  serverData: SharePlaySyncInput,
  dedupedQueue: SharePlaySyncQueueRow[],
): number {
  const serverPlayingItemId =
    serverData.queue[serverData.index ?? serverData.currentPlayingIndex ?? 0]?.id;
  return dedupedQueue.findIndex((item) => item.id === serverPlayingItemId);
}
