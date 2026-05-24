import type {
  PlayerStateSchema,
  QueueStateSchema,
  RoomStateSchema,
  roomParticipant,
} from "@ciderjams/proto";
import type { CiderSyncSocket } from "../api/client";

import { defineStore } from "pinia";
import { ref, shallowRef } from "vue";

import { useSharePlayStore } from "../playback/store";
import { showJamAlert } from "../ui/notifications";
import { JamGuestActions } from "./guest/actions";
import { MusicKitJamHostPlayerAdapter, MusicKitJamHostSyncSource } from "./host/adapters/musickit";
import { type JamHostSessionHandle, startJamHostSession } from "./host/session";
import { ensureJamIdentity, prefetchJamIdentity } from "./identity";
import { createJamStoreInboundSync } from "./playback-bindings";
import { transitionRoomState } from "./room-lifecycle";
import { connectJamSocket } from "./socket";
import { handleJamSocketError } from "./socket-errors";

export const useJamStore = defineStore("jam-store", () => {
  const socket = shallowRef<CiderSyncSocket | null>(null);
  const identity = ref<roomParticipant | null>(null);
  const currentJam = ref<RoomStateSchema | null>(null);
  const lastQueueState = shallowRef<QueueStateSchema | null>(null);
  const lastPlayerState = shallowRef<PlayerStateSchema | null>(null);
  const jamHostSession = shallowRef<JamHostSessionHandle | null>(null);
  const guestActions = shallowRef<JamGuestActions | null>(null);
  const pendingRoomJoin = ref(false);

  const isHost = () => jamHostSession.value !== null;

  const inboundSync = createJamStoreInboundSync({
    getMusicKit: () => MusicKit.getInstance() ?? null,
    getQueue: () => lastQueueState.value,
    getPlayer: () => lastPlayerState.value,
    isHost,
    getJamHostSession: () => jamHostSession.value,
  });

  function detachSocket() {
    socket.value?.close();
    socket.value = null;
  }

  function onSocketError(rawMessage: string) {
    handleJamSocketError(rawMessage, {
      pendingRoomJoin: pendingRoomJoin.value,
      hasCurrentJam: !!currentJam.value,
      onPendingJoinFailed() {
        pendingRoomJoin.value = false;
        abortPendingJoin();
      },
    });
  }

  async function getConnectedSocket(): Promise<CiderSyncSocket> {
    if (!identity.value) throw new Error("You are not logged in");

    detachSocket();
    const client = await connectJamSocket(identity.value, {
      onRoomState: applyRoomState,
      onQueueState(payload) {
        const prev = lastQueueState.value;
        lastQueueState.value = payload;
        inboundSync.onQueueState(lastQueueState.value, prev);
      },
      onPlayerState(payload) {
        lastPlayerState.value = payload;
        inboundSync.onPlayerState();
      },
      onSocketError,
    });
    socket.value = client;
    return client;
  }

  function applyRoomState(payload: RoomStateSchema) {
    const prev = currentJam.value;
    pendingRoomJoin.value = false;

    const transition = transitionRoomState(prev, payload, {
      isHost: isHost(),
      myUserId: identity.value?.userId,
    });
    if (transition.kind === "host_left") {
      showJamAlert("The host ended the listening session.", "Session ended");
      leaveJam();
      return;
    }

    currentJam.value = transition.next;
    useSharePlayStore().updateRoom(transition.next);
  }

  async function createJam() {
    await ensureJamIdentity(identity);

    useSharePlayStore().activate();

    const client = await getConnectedSocket();
    const mk = MusicKit.getInstance();
    if (!mk) throw new Error("MusicKit is not available");

    jamHostSession.value = startJamHostSession({
      socket: client,
      getLastJamQueue: () => lastQueueState.value,
      getLastJamPlayer: () => lastPlayerState.value,
      playerAdapter: new MusicKitJamHostPlayerAdapter(mk),
      syncSource: new MusicKitJamHostSyncSource(mk),
    });
  }

  async function joinJam(roomCode: string) {
    const code = roomCode.trim().toUpperCase();
    if (!code) throw new Error("Enter a session code");

    await ensureJamIdentity(identity);

    useSharePlayStore().activate();

    const client = await getConnectedSocket();
    const mk = MusicKit.getInstance();
    if (!mk) throw new Error("MusicKit is not available");

    guestActions.value?.stop();
    guestActions.value = new JamGuestActions(
      mk,
      client,
      () => useSharePlayStore().inhibitor?.isSuppressingGuestActions() ?? false,
      () => lastQueueState.value,
    );
    guestActions.value.start();

    pendingRoomJoin.value = true;
    client.send({ event: "room.join", payload: { roomCode: code } });
  }

  function abortPendingJoin() {
    guestActions.value?.stop();
    guestActions.value = null;
    useSharePlayStore().deactivate();
  }

  function leaveJam() {
    pendingRoomJoin.value = false;
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
    inboundSync.reset();
    useSharePlayStore().deactivate();
  }

  prefetchJamIdentity(identity);

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
