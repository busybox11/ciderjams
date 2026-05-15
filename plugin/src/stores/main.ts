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
  makeQueuePayload,
  makeRoomPlaybackStatePayload,
  mapRepeatMode,
  mapShuffleMode,
  playbackPositionMs,
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
  /** temporary debounce to prevent excessive host MK echoes */
  const hostPushSuppressUntil = ref(0);
  const lastHostTimeSeekSentAt = ref(0);

  function bumpHostPushSuppress() {
    hostPushSuppressUntil.value = Date.now() + 160;
  }

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
        bumpHostPushSuppress();
        lastQueueState.value = msg.payload as QueueStateSchema;
        flushSharePlayFromServerSnapshots();
        break;
      case "player.state":
        bumpHostPushSuppress();
        lastPlayerState.value = msg.payload as PlayerStateSchema;
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
      if (Date.now() < hostPushSuppressUntil.value) return;
      const s = socket.value;
      if (!s || s.ws.readyState !== WebSocket.OPEN) return;
      try {
        const payload = makeQueuePayload(mk, lastQueueState.value);
        s.send({ event: "queue.set", payload });
      } catch (e) {
        log.warn("host queue.set failed", e);
      }
    };

    const pushPlaybackFromMusicKit = (mkEvent: string) => {
      if (Date.now() < hostPushSuppressUntil.value) return;
      const s = socket.value;
      if (!s || s.ws.readyState !== WebSocket.OPEN) return;

      switch (mkEvent) {
        case "playbackStateDidChange":
          s.send({
            event: "player.host.sync",
            payload: {
              playbackState: makeRoomPlaybackStatePayload(mk),
            },
          });
          break;
        case "playbackPlay":
          s.send({ event: "player.play", payload: {} });
          break;
        case "playbackPause":
        case "playbackStop":
          s.send({ event: "player.pause", payload: {} });
          break;
        case "playbackSeek":
        case "playbackScrub":
          s.send({
            event: "player.seek",
            payload: { positionMs: playbackPositionMs(mk) },
          });
          break;
        case "playbackTimeDidChange": {
          const t = Date.now();
          if (t - lastHostTimeSeekSentAt.value < 450) return;
          lastHostTimeSeekSentAt.value = t;
          s.send({
            event: "player.seek",
            payload: { positionMs: playbackPositionMs(mk) },
          });
          break;
        }
        case "repeatModeDidChange":
          s.send({
            event: "player.setRepeat",
            payload: { repeatMode: mapRepeatMode(mk.player?.repeatMode ?? 0) },
          });
          break;
        case "shuffleModeDidChange":
          s.send({
            event: "player.setShuffle",
            payload: {
              shuffleMode: mapShuffleMode(mk.player?.shuffleMode ?? 0),
            },
          });
          break;
        case "playbackSkip":
        case "sharePlay.nextItem":
          s.send({ event: "player.next", payload: {} });
          break;
        case "sharePlay.previousItem":
          s.send({ event: "player.previous", payload: {} });
          break;
        default:
          break;
      }
    };

    sharePlayHost.value = new SharePlayHost(mk, {
      onQueueSync: pushQueueFromMusicKit,
      onPlaybackEvent: pushPlaybackFromMusicKit,
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
    hostPushSuppressUntil.value = 0;
    lastHostTimeSeekSentAt.value = 0;
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
