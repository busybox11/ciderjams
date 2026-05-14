import { useMusicKit } from "@ciderapp/pluginkit";
import { defineStore } from "pinia";
import { ref, shallowRef } from "vue";

import type { roomParticipant, RoomStateSchema } from "@ciderjams/proto";
import { outboundWsMessageSchema } from "@ciderjams/proto";
import { ciderSyncSocket, type CiderSyncSocket } from "../lib/api";
import { log } from "../lib/logger";

function waitForWebSocketOpen(client: CiderSyncSocket): Promise<void> {
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

export const useJamStore = defineStore("jam-store", () => {
  const socket = shallowRef<CiderSyncSocket | null>(null);
  const identity = ref<roomParticipant | null>(null);
  const currentJam = ref<RoomStateSchema | null>(null);

  function detachSocket() {
    socket.value?.close();
    socket.value = null;
  }

  function applyRoomState(payload: RoomStateSchema) {
    currentJam.value = payload;
  }

  function onSocketMessage(data: unknown) {
    const parsed = outboundWsMessageSchema.safeParse(data);
    if (!parsed.success) {
      log.warn("Jam socket: bad inbound frame", parsed.error.issues.slice(0, 3));
      return;
    }

    const msg = parsed.data;
    if ("type" in msg && msg.type === "error") {
      log.error("Jam socket error:", msg.message);
      return;
    }
    if ("event" in msg && msg.event === "room.state") {
      applyRoomState(msg.payload as RoomStateSchema);
    }
  }

  /** Opens a fresh WS, attaches handlers, resolves when the socket is usable. */
  async function getConnectedSocket(): Promise<CiderSyncSocket> {
    if (!identity.value) {
      throw new Error("You are not logged in");
    }

    detachSocket();

    const client = ciderSyncSocket(identity.value);
    socket.value = client;
    client.subscribe((ev) => onSocketMessage(ev.data));
    await waitForWebSocketOpen(client);
    return client;
  }

  async function createJam() {
    if (!identity.value) {
      await refreshIdentity();
      if (!identity.value) {
        throw new Error("Could not load Apple Music profile");
      }
    }

    const client = await getConnectedSocket();
    client.send({
      event: "room.create",
      payload: { user: identity.value },
    });
  }

  function leaveJam() {
    const s = socket.value;
    if (s?.ws.readyState === WebSocket.OPEN && currentJam.value) {
      s.send({ event: "room.leave", payload: {} });
    }
    detachSocket();
    currentJam.value = null;
  }

  async function refreshIdentity() {
    try {
      const musicKit = useMusicKit();
      const result = await musicKit.api.personalSocialProfile();
      const handle = result.attributes.handle;
      const resource = result as { id?: string };
      identity.value = {
        userId:
          typeof resource.id === "string" && resource.id.length > 0
            ? resource.id
            : `handle:${handle}`,
        name: result.attributes.name,
        handle,
        avatar: MusicKit.formatArtworkURL(
          result.attributes.artwork,
          64,
          64,
        ).replace("{c}", ".webp"),
      };
    } catch (error) {
      log.error("Failed to fetch identity:", error);
    }
  }

  void refreshIdentity();

  return {
    currentJam,
    identity,
    createJam,
    leaveJam,
  };
});
