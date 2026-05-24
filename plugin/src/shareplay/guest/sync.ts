import type { SharePlaySyncInput } from "@ciderjams/proto";
import type { SharePlayGuestAdapterHooks } from "../adapter";

import { createLogger } from "@ciderjams/proto";

import { stopMusicKitIfQueueEmpty } from "../../musickit/playback/apply";
import { applySharePlayPlaybackFromServer } from "../sync/playback-apply";
import { normalizeSharePlaySyncQueue, resolveSharePlayPlayingIndex } from "../sync/queue-rows";
import { syncMusicKitQueueFromSharePlay } from "../sync/queue-sync";

const log = createLogger("plugin", "shareplay/guest/sync");

export interface SharePlayServerSyncHooks {
  hooks: SharePlayGuestAdapterHooks;
  currentHooks: SharePlayGuestAdapterHooks;
}

export class SharePlayServerSync {
  private lastServerQueueIds: string[] | null = null;

  constructor(
    private readonly getSyncHooks: () => SharePlayServerSyncHooks,
    private readonly isStaleSync: (gen: number) => boolean,
  ) {}

  reset() {
    this.lastServerQueueIds = null;
  }

  async apply(
    music: MusicKit.MusicKitInstanceLoose,
    serverData: SharePlaySyncInput,
    gen: number,
  ): Promise<void> {
    log.debug("applyServerSync", serverData);

    music.autoplayEnabled = false;

    const dedupedQueue = normalizeSharePlaySyncQueue(serverData.queue);
    if (dedupedQueue.length === 0 && (music.isPlaying || music.nowPlayingItemIndex !== -1)) {
      stopMusicKitIfQueueEmpty(music);
      return;
    }

    const playingIndex = resolveSharePlayPlayingIndex(serverData, dedupedQueue);
    const isStale = () => this.isStaleSync(gen);

    const queueResult = await syncMusicKitQueueFromSharePlay(
      music,
      dedupedQueue,
      playingIndex,
      this.lastServerQueueIds,
      isStale,
    );
    if (!queueResult || isStale()) return;

    this.lastServerQueueIds = queueResult.catalogIds;

    const { hooks, currentHooks } = this.getSyncHooks();
    await applySharePlayPlaybackFromServer(music, serverData, {
      playingIndex,
      queueChanged: queueResult.queueChanged,
      queueAppliedPosition: queueResult.didApplyPlaybackPosition,
      instantiatedQueue: queueResult.instantiatedQueue,
      isStale,
      onPublish(payload) {
        currentHooks.onMediaStatePublished?.(payload) ?? hooks.onMediaStatePublished?.(payload);
      },
    });

    log.debug("server data", serverData);
  }
}
