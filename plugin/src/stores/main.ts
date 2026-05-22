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
import {
  MusicKitJamHostPlayerAdapter,
  MusicKitJamHostSyncSource,
} from "../lib/jam/adapters/musickit";
import { jamPlaybackToSharePlayPayload } from "../lib/jam/guest-shareplay";
import {
  startJamHostSession,
  waitForWebSocketOpen,
  type JamHostSessionHandle,
} from "../lib/jam/session";
import { log } from "../lib/logger";
import { SharePlayGuestActions } from "../shareplay/guest-actions";
import { useSharePlayStore } from "./shareplay";

export const useJamStore = defineStore("jam-store", () => {
  const socket = shallowRef<CiderSyncSocket | null>(null);
  const identity = ref<roomParticipant | null>(null);
  const currentJam = ref<RoomStateSchema | null>(null);
  const lastQueueState = shallowRef<QueueStateSchema | null>(null);
  const lastPlayerState = shallowRef<PlayerStateSchema | null>(null);
  const jamHostSession = shallowRef<JamHostSessionHandle | null>(null);
  const guestActions = shallowRef<SharePlayGuestActions | null>(null);

  const isHost = () => jamHostSession.value !== null;

  function detachSocket() {
    socket.value?.close();
    socket.value = null;
  }

  function applyRoomState(payload: RoomStateSchema) {
    currentJam.value = payload;
  }

  let sharePlayFlushTimer: ReturnType<typeof setTimeout> | null = null;

  async function flushSharePlayFromServerSnapshots() {
    const q = lastQueueState.value;
    const p = lastPlayerState.value;
    if (!Array.isArray(q) || !p) return;

    const share = useSharePlayStore();
    if (!share.inhibitor) return;

    if (isHost()) jamHostSession.value?.suppressHostSync(5000);

    const payload = jamPlaybackToSharePlayPayload(q, p);
    await share.syncFromServer(payload);
  }

  function scheduleSharePlayFlush() {
    if (sharePlayFlushTimer) clearTimeout(sharePlayFlushTimer);
    sharePlayFlushTimer = setTimeout(() => {
      sharePlayFlushTimer = null;
      flushSharePlayFromServerSnapshots();
    }, 0);
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
        scheduleSharePlayFlush();
        break;
      case "player.state":
        lastPlayerState.value = msg.payload as PlayerStateSchema;
        scheduleSharePlayFlush();
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

    const playerAdapter = new MusicKitJamHostPlayerAdapter(mk);
    const syncSource = new MusicKitJamHostSyncSource(mk);

    jamHostSession.value = startJamHostSession({
      socket: client,
      getLastJamQueue: () => lastQueueState.value,
      getLastJamPlayer: () => lastPlayerState.value,
      playerAdapter,
      syncSource,
    });
  }

  async function joinJam(roomCode: string) {
    const code = roomCode.trim().toUpperCase();
    if (!code) {
      throw new Error("Enter a session code");
    }

    if (!identity.value) {
      await refreshIdentity();
      if (!identity.value) {
        throw new Error("Could not load Apple Music profile");
      }
    }

    useSharePlayStore().activate();

    const client = await getConnectedSocket();
    guestActions.value?.stop();
    const mk = MusicKit.getInstance() as MusicKit.MusicKitInstanceLoose;
    guestActions.value = new SharePlayGuestActions(
      mk,
      client,
      () =>
        useSharePlayStore().inhibitor?.isSuppressingGuestActions() ?? false,
      () => lastQueueState.value,
    );
    guestActions.value.start();
    client.send({
      event: "room.join",
      payload: { roomCode: code },
    });
  }

  function leaveJam() {
    jamHostSession.value?.stop();
    jamHostSession.value = null;
    guestActions.value?.stop();
    guestActions.value = null;

    const s = socket.value;
    if (s?.ws.readyState === WebSocket.OPEN && currentJam.value) {
      s.send({ event: "room.leave", payload: {} });
    }
    detachSocket();
    currentJam.value = null;
    lastQueueState.value = null;
    lastPlayerState.value = null;
    useSharePlayStore().deactivate();
  }

  async function refreshIdentity() {
    try {
      const musicKit = useMusicKit();
      const result = await musicKit.api.personalSocialProfile();
      const handle = result.attributes.handle;
      const resource = result as { id?: string };

      // TODO: remove this - only for multi platform debug
      const isLinux = window.navigator.userAgent.toLowerCase().includes("linux");

      if (isLinux) {
        identity.value = {
          userId:
            typeof resource.id === "string" && resource.id.length > 0
              ? `${resource.id}-linux`
              : `handle:${handle}-linux`,
          name: `${result.attributes.name} (Linux)`,
          handle: `${handle}-linux`,
          avatar: "https://pbs.twimg.com/profile_images/1994727967587528704/p5QVaU0q_400x400.jpg",
        };
        return;
      }

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
    joinJam,
    leaveJam,
  };
});
