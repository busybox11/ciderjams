import type { QueueStateSchema } from "@ciderjams/proto";

import type { CiderSyncSocket } from "../api";
import { log } from "../logger";
import type { JamHostPlayerAdapter } from "./player-adapter";
import type { SharePlayHostAdapterHooks } from "../../shareplay/adapter";

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

/** Wire host push handlers to a sync source and send `room.create`. */
export function startJamHostSession(args: {
  socket: CiderSyncSocket;
  getLastJamQueue: () => QueueStateSchema | null;
  playerAdapter: JamHostPlayerAdapter;
  syncSource: JamHostSyncSource;
}): JamHostSessionHandle {
  const { socket, getLastJamQueue, playerAdapter, syncSource } = args;

  const pushQueueFromAdapter = () => {
    const s = socket;
    if (!s || s.ws.readyState !== WebSocket.OPEN) return;
    try {
      const payload = playerAdapter.getQueueSetPayload(getLastJamQueue());
      s.send({ event: "queue.set", payload });
    } catch (e) {
      log.warn("host queue.set failed", e);
    }
  };

  const pushPlaybackFromAdapter = () => {
    const s = socket;
    if (!s || s.ws.readyState !== WebSocket.OPEN) return;
    s.send({
      event: "player.host.sync",
      payload: {
        playbackState: playerAdapter.getHostSyncPlaybackState(),
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
      syncSource.stop();
    },
  };
}
