import { useMusicKit } from "@ciderapp/pluginkit";
import { defineStore } from "pinia";
import { ref, shallowRef } from "vue";

import type {
  PlayerStateSchema,
  QueueStateSchema,
  roomParticipant,
  RoomStateSchema,
} from "@ciderjams/proto";
import { outboundWsMessageSchema } from "@ciderjams/proto";
import { ciderSyncSocket, type CiderSyncSocket } from "../lib/api";
import { log } from "../lib/logger";

import {
  makePlayerHostSyncPayload,
  makeQueuePayload,
  makeRoomPlaybackStatePayload,
} from "../lib/musickit";
import type { SharePlaySyncInput } from "../shareplay";
import { SharePlayHost } from "../shareplay/host";
import { useSharePlayStore } from "./shareplay";

function sharePlayPlaybackNumber(
  playbackState: PlayerStateSchema["playbackState"],
): number {
  return playbackState === "FULL_PLAYBACK_ONLY" ||
    playbackState === "SHAREPLAY_PARTICIPANT"
    ? 2
    : 0;
}

function sharePlayRepeatNumber(
  repeatMode: PlayerStateSchema["repeatMode"],
): number {
  const m: Record<PlayerStateSchema["repeatMode"], number> = {
    REPEAT_OFF: 0,
    REPEAT_ALL: 1,
    REPEAT_ONE: 2,
  };
  return m[repeatMode] ?? 0;
}

function sharePlayShuffleNumber(
  shuffleMode: PlayerStateSchema["shuffleMode"],
): number {
  return shuffleMode === "SHUFFLE_ON" ? 1 : 0;
}

/** Minimal MusicKit-like queue items from server `queueEntry` rows (full metadata may require catalog API later). */
function jamQueueToSharePlayQueue(queue: QueueStateSchema) {
  return queue.map((e) => ({
    id: e.itemCatalogId,
    type: "songs",
    attributes: {
      playParams: { id: e.itemCatalogId, kind: "song" },
    },
  }));
}

function jamPlaybackToSharePlayPayload(
  queue: QueueStateSchema,
  player: PlayerStateSchema,
): SharePlaySyncInput {
  return {
    queue: jamQueueToSharePlayQueue(queue),
    index: player.currentPlayingIndex,
    currentPlayingIndex: player.currentPlayingIndex,
    elapsedTime: player.elapsedTimeMs,
    playbackState: sharePlayPlaybackNumber(player.playbackState),
    repeatMode: sharePlayRepeatNumber(player.repeatMode),
    shuffleMode: sharePlayShuffleNumber(player.shuffleMode),
    autoPlay: player.autoPlay,
  };
}

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
  const lastQueueState = shallowRef<QueueStateSchema | null>(null);
  const lastPlayerState = shallowRef<PlayerStateSchema | null>(null);
  const sharePlayHost = shallowRef<SharePlayHost | null>(null);

  const isHost = () => sharePlayHost.value !== null;

  function detachSocket() {
    socket.value?.close();
    socket.value = null;
  }

  function applyRoomState(payload: RoomStateSchema) {
    currentJam.value = payload;
  }

  function flushSharePlayFromServerSnapshots() {
    const q = lastQueueState.value;
    const p = lastPlayerState.value;
    if (!q || !("queue" in q) || !p) return;

    const share = useSharePlayStore();
    if (!share.inhibitor) return;

    const payload = jamPlaybackToSharePlayPayload(q, p);
    void share.syncFromServer(payload);
  }

  function onSocketMessage(data: unknown) {
    const parsed = outboundWsMessageSchema.safeParse(data);
    if (!parsed.success) {
      log.warn(
        "Jam socket: bad inbound frame",
        parsed.error.issues.slice(0, 3),
      );
      return;
    }
    log.debug("onSocketMessage", parsed.data);

    const msg = parsed.data;
    if ("type" in msg) {
      if (msg.type === "error") log.error("Jam socket error:", msg.message);
      return;
    }
    switch (msg.event) {
      case "room.state":
        applyRoomState(msg.payload as RoomStateSchema);
        break;
      case "queue.state":
        lastQueueState.value = msg.payload as QueueStateSchema;
        if (isHost()) return;
        flushSharePlayFromServerSnapshots();
        break;
      case "player.state":
        lastPlayerState.value = msg.payload as PlayerStateSchema;
        if (isHost()) return;
        flushSharePlayFromServerSnapshots();
        break;
      default:
        break;
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

    useSharePlayStore().activate();

    const client = await getConnectedSocket();
    const mk = MusicKit.getInstance() as MusicKit.MusicKitInstanceLoose;

    const roomCreatePlaybackState = makeRoomPlaybackStatePayload(mk);
    client.send({
      event: "room.create",
      payload: {
        playbackState: roomCreatePlaybackState,
      },
    });

    const pushQueueFromMusicKit = () => {
      const s = socket.value;
      if (!s || s.ws.readyState !== WebSocket.OPEN) return;
      try {
        const payload = makeQueuePayload(mk, lastQueueState.value);
        s.send({ event: "queue.set", payload });
      } catch (e) {
        log.warn("host queue.set failed", e);
      }
    };

    const pushPlaybackFromMusicKit = () => {
      const s = socket.value;
      if (!s || s.ws.readyState !== WebSocket.OPEN) return;

      s.send({
        event: "player.host.sync",
        payload: {
          playbackState: makePlayerHostSyncPayload(mk),
        },
      });
    };

    sharePlayHost.value = new SharePlayHost(mk, {
      onSyncQueue: pushQueueFromMusicKit,
      onSyncPlayback: pushPlaybackFromMusicKit,
    });
    sharePlayHost.value.inject();
  }

  function leaveJam() {
    const s = socket.value;
    if (s?.ws.readyState === WebSocket.OPEN && currentJam.value) {
      s.send({ event: "room.leave", payload: {} });
    }
    detachSocket();
    currentJam.value = null;
    lastQueueState.value = null;
    lastPlayerState.value = null;
    useSharePlayStore().deactivate();
    sharePlayHost.value?.eject();
    sharePlayHost.value = null;
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
    lastQueueState,
    lastPlayerState,
    createJam,
    leaveJam,
  };
});
