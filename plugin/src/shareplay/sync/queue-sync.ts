import type { SharePlaySyncQueueRow } from "@ciderjams/proto";

import { syncMusicKitQueueFromCatalogIds } from "../../musickit/queue/sync";
import { sharePlayQueueCatalogIds } from "./queue-rows";

export async function syncMusicKitQueueFromSharePlay(
  music: MusicKit.MusicKitInstanceLoose,
  dedupedQueue: readonly SharePlaySyncQueueRow[],
  playingIndex: number,
  lastCatalogIds: string[] | null,
  isStale: () => boolean,
) {
  return syncMusicKitQueueFromCatalogIds(
    music,
    sharePlayQueueCatalogIds(dedupedQueue),
    playingIndex,
    lastCatalogIds,
    isStale,
  );
}
