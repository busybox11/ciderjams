import type { PlayerStateSchema, QueueStateSchema } from "@ciderjams/proto";

import { createLogger, jamPlaybackToSharePlayPayload } from "@ciderjams/proto";

import { jamQueueCatalogIds } from "../../musickit/payloads";
import { applyServerPlaybackToMusicKit } from "../../musickit/playback/apply";

const log = createLogger("plugin", "session/sync/inbound");

const APPLY_SUPPRESS_MS = 750;

export { jamPlaybackToSharePlayPayload };

export function jamQueueCatalogOrderChanged(
  prev: QueueStateSchema | null,
  next: QueueStateSchema,
): boolean {
  if (!prev) return true;
  const a = jamQueueCatalogIds(prev);
  const b = jamQueueCatalogIds(next);
  return a.length !== b.length || a.some((id, i) => id !== b[i]);
}

export type JamInboundSyncOptions = {
  getMusicKit: () => MusicKit.MusicKitInstanceLoose | null;
  getQueue: () => QueueStateSchema | null;
  getPlayer: () => PlayerStateSchema | null;
  isHost: () => boolean;
  suppressLocalSync: (durationMs?: number) => void;
  applyQueueViaSharePlay: (queue: QueueStateSchema, player: PlayerStateSchema) => Promise<void>;
};

export function createJamInboundSync(options: JamInboundSyncOptions) {
  let chain = Promise.resolve();
  let dirty = false;
  let queueRebuildNeeded = false;

  function enqueue() {
    dirty = true;
    chain = chain.then(() => drain());
  }

  async function drain() {
    while (dirty) {
      dirty = false;
      const rebuildQueue = queueRebuildNeeded;
      queueRebuildNeeded = false;

      const music = options.getMusicKit();
      const queue = options.getQueue();
      const player = options.getPlayer();
      if (!music || !Array.isArray(queue) || !player) continue;

      options.suppressLocalSync(APPLY_SUPPRESS_MS);

      try {
        if (rebuildQueue) {
          log.debug("inbound: SharePlay queue apply");
          await options.applyQueueViaSharePlay(queue, player);
        } else {
          log.debug("inbound: playback apply");
          await applyServerPlaybackToMusicKit(music, queue, player);
        }
      } catch (e) {
        log.warn("inbound jam sync failed", e);
      }
    }
  }

  return {
    reset() {
      chain = Promise.resolve();
      dirty = false;
      queueRebuildNeeded = false;
    },
    onQueueState(next: QueueStateSchema, prev: QueueStateSchema | null) {
      if (jamQueueCatalogOrderChanged(prev, next)) {
        queueRebuildNeeded = true;
      }
      enqueue();
    },
    onPlayerState() {
      enqueue();
    },
  };
}
