import type {
  PlayerStateSchema,
  QueueStateSchema,
} from "@ciderjams/proto";

import {
  applyJamPlaybackFromServer,
  jamQueueCatalogOrderChanged,
} from "./apply-playback";
import { log } from "../logger";

const APPLY_SUPPRESS_MS = 750;

export type JamServerSyncDeps = {
  getMusic: () => MusicKit.MusicKitInstanceLoose | null;
  getQueue: () => QueueStateSchema | null;
  getPlayer: () => PlayerStateSchema | null;
  isHost: () => boolean;
  suppressHostPlayback: (durationMs?: number) => void;
  bumpGuestActionSuppress: (durationMs?: number) => void;
  syncQueueFromServer: (
    queue: QueueStateSchema,
    player: PlayerStateSchema,
  ) => Promise<void>;
};

/** Serialized apply of latest server queue/player snapshots. */
export function createJamServerSync(deps: JamServerSyncDeps) {
  let chain = Promise.resolve();
  let dirty = false;
  let queueSyncNeeded = false;

  function markDirty(kind: "queue" | "player") {
    dirty = true;
    if (kind === "queue") queueSyncNeeded = true;
    enqueue();
  }

  function enqueue() {
    chain = chain.then(() => drain());
  }

  async function drain() {
    while (dirty) {
      dirty = false;
      const needQueue = queueSyncNeeded;
      queueSyncNeeded = false;

      const music = deps.getMusic();
      const queue = deps.getQueue();
      const player = deps.getPlayer();
      if (!music || !Array.isArray(queue) || !player) continue;

      deps.bumpGuestActionSuppress(APPLY_SUPPRESS_MS);
      if (deps.isHost()) deps.suppressHostPlayback(APPLY_SUPPRESS_MS);

      try {
        if (needQueue) {
          log.debug("jam sync: full queue apply");
          await deps.syncQueueFromServer(queue, player);
        } else {
          log.debug("jam sync: playback only");
          await applyJamPlaybackFromServer(music, queue, player);
        }
      } catch (e) {
        log.warn("jam server sync failed", e);
      }
    }
  }

  function reset() {
    chain = Promise.resolve();
    dirty = false;
    queueSyncNeeded = false;
  }

  return {
    reset,
    noteQueueMessage(next: QueueStateSchema, prev: QueueStateSchema | null) {
      if (jamQueueCatalogOrderChanged(prev, next)) queueSyncNeeded = true;
      markDirty("queue");
    },
    notePlayerMessage() {
      markDirty("player");
    },
  };
}
