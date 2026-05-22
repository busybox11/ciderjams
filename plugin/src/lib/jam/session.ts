import type {
  PlayerHostSyncPayload,
  QueueSetPayload,
  QueueStateSchema,
} from "@ciderjams/proto";

import type { SharePlayHostAdapterHooks } from "../../shareplay/adapter";
import type { CiderSyncSocket } from "../api";
import { log } from "../logger";
import type { JamHostPlayerAdapter } from "./player-adapter";

export interface JamHostSyncSource {
  start(hooks: SharePlayHostAdapterHooks): void;
  stop(): void;
}

export type JamHostSessionHandle = {
  stop: () => void;
};

export function waitForWebSocketOpen(client: CiderSyncSocket): Promise<void> {
  const { ws } = client;
  if (ws.readyState === WebSocket.OPEN) return Promise.resolve();
  if (
    ws.readyState === WebSocket.CLOSING ||
    ws.readyState === WebSocket.CLOSED
  ) {
    return Promise.reject(new Error("WebSocket is closed"));
  }
  return new Promise((resolve, reject) => {
    const onOpen = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("WebSocket connection failed"));
    };
    const cleanup = () => {
      ws.removeEventListener("open", onOpen);
      ws.removeEventListener("error", onError);
    };
    ws.addEventListener("open", onOpen);
    ws.addEventListener("error", onError);
  });
}

type JamHostSharedSlices = {
  queue: QueueStateSchema | null;
};

function isSameQueueCatalogOrder(
  last: { itemCatalogId: string }[],
  next: { itemCatalogId: string }[],
): boolean {
  return (
    last.length === next.length &&
    last.every((entry, i) => entry.itemCatalogId === next[i].itemCatalogId)
  );
}

const PLAYBACK_STATE_GUARDS: ([(state: PlayerHostSyncPayload["playbackState"]) => boolean, string])[] = [
  [(state) => (!state.isPlaying || state.currentPlayingIndex !== -1),
    "isPlaying but currentPlayingIndex cannot be -1",
  ],
];

const QUEUE_SET_GUARDS: ([(
  payload: QueueSetPayload,
  slices: JamHostSharedSlices,
) => boolean, string])[] = [
  [
    (payload, { queue }) =>
      !queue || !isSameQueueCatalogOrder(queue, payload),
    "queue catalog order unchanged",
  ],
];

function playbackStateGuard(state: PlayerHostSyncPayload["playbackState"]): boolean {
  for (const [guard, message] of PLAYBACK_STATE_GUARDS) {
    if (!guard(state)) {
      log.warn("playback state guard failed", message);
      log.debug("playback state", state);
      return false;
    }
  }

  return true;
}

function queueSetGuard(
  payload: QueueSetPayload,
  getSlices: () => JamHostSharedSlices,
): boolean {
  const slices = getSlices();
  for (const [guard, message] of QUEUE_SET_GUARDS) {
    if (!guard(payload, slices)) {
      log.warn("queue set guard failed", message);
      log.debug("queue set payload", payload, "last queue", slices.queue);
      return false;
    }
  }

  return true;
}

/** Wire host push handlers to a sync source and send `room.create`. */
export function startJamHostSession(args: {
  socket: CiderSyncSocket;
  getLastJamQueue: () => QueueStateSchema | null;
  playerAdapter: JamHostPlayerAdapter;
  syncSource: JamHostSyncSource;
}): JamHostSessionHandle {
  const { socket, getLastJamQueue, playerAdapter, syncSource } = args;

  const getSlices = (): JamHostSharedSlices => ({
    queue: getLastJamQueue(),
  });

  let lastSentQueueCatalogIds: string[] | null = null;

  const pushQueueFromAdapter = () => {
    const s = socket;
    if (!s || s.ws.readyState !== WebSocket.OPEN) return;
    try {
      const payload = playerAdapter.getQueueSetPayload(getLastJamQueue());
      const catalogIds = payload.map((e) => e.itemCatalogId);
      if (
        lastSentQueueCatalogIds &&
        lastSentQueueCatalogIds.length === catalogIds.length &&
        lastSentQueueCatalogIds.every((id, i) => id === catalogIds[i])
      ) {
        return;
      }
      if (!queueSetGuard(payload, getSlices)) return;
      lastSentQueueCatalogIds = catalogIds;
      s.send({ event: "queue.set", payload });
    } catch (e) {
      log.warn("host queue.set failed", e);
    }
  };

  const pushPlaybackFromAdapter = () => {
    const s = socket;
    if (!s || s.ws.readyState !== WebSocket.OPEN) return;

    const state = playerAdapter.getHostSyncPlaybackState();
    if (!playbackStateGuard(state)) return;

    s.send({
      event: "player.host.sync",
      payload: {
        playbackState: state,
      },
    });
  };

  syncSource.start({
    onSyncQueue: pushQueueFromAdapter,
    onSyncPlayback: pushPlaybackFromAdapter,
  });

  socket.send({
    event: "room.create",
    payload: {
      playbackState: playerAdapter.getRoomCreatePlaybackState(),
    },
  });

  return {
    stop: () => {
      lastSentQueueCatalogIds = null;
      syncSource.stop();
    },
  };
}
