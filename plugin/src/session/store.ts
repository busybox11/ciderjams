import type {
  PlayerStateSchema,
  QueueStateSchema,
  RoomStateSchema,
  roomParticipant,
} from "@ciderjams/proto";

import { defineStore } from "pinia";
import { ref, shallowRef } from "vue";

import { type CiderSyncSocket } from "../api/client";
import { jamErrorMessage, showJamAlert } from "../ui/notifications";
import { useSharePlayStore } from "../playback/store";
import { JamGuestActions } from "./guest/actions";
import {
  MusicKitJamHostPlayerAdapter,
  MusicKitJamHostSyncSource,
} from "./host/adapters/musickit";
import {
  type JamHostSessionHandle,
  startJamHostSession,
} from "./host/session";
import { fetchJamIdentity } from "./identity";
import { hostLeftSession, notifyParticipantChanges } from "./room-lifecycle";
import { connectJamSocket } from "./socket";
import { createJamInboundSync, jamPlaybackToSharePlayPayload } from "./sync/inbound";

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

  const inboundSync = createJamInboundSync({
    getMusicKit: () => MusicKit.getInstance() as MusicKit.MusicKitInstanceLoose | null,
    getQueue: () => lastQueueState.value,
    getPlayer: () => lastPlayerState.value,
    isHost,
    suppressLocalSync(ms) {
      const share = useSharePlayStore();
      share.bumpGuestActionSuppress(ms);
      if (isHost()) jamHostSession.value?.suppressHostPlaybackSync(ms);
    },
    applyQueueViaSharePlay(queue, player) {
      const share = useSharePlayStore();
      if (!share.inhibitor) return Promise.resolve();
      return (
        share.syncFromServer(jamPlaybackToSharePlayPayload(queue, player)) ?? Promise.resolve()
      );
    },
  });

  function detachSocket() {
    socket.value?.close();
    socket.value = null;
  }

  function onSocketError(rawMessage: string) {
    const { message, title } = jamErrorMessage(rawMessage);
    if (pendingRoomJoin.value && !currentJam.value) {
      pendingRoomJoin.value = false;
      abortPendingJoin();
      showJamAlert(message, title);
      return;
    }
    if (currentJam.value) showJamAlert(message, title);
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

    if (prev) {
      if (!isHost() && hostLeftSession(prev, payload)) {
        showJamAlert("The host ended the listening session.", "Session ended");
        leaveJam();
        return;
      }
      notifyParticipantChanges(prev, payload, identity.value?.userId);
    }

    currentJam.value = payload;
  }

  async function ensureIdentity() {
    if (identity.value) return;
    identity.value = await fetchJamIdentity();
    if (!identity.value) {
      throw new Error("Could not load Apple Music profile");
    }
  }

  async function createJam() {
    await ensureIdentity();

    useSharePlayStore().activate();

    const client = await getConnectedSocket();
    const mk = MusicKit.getInstance() as MusicKit.MusicKitInstanceLoose;

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

    await ensureIdentity();

    useSharePlayStore().activate();

    const client = await getConnectedSocket();
    const mk = MusicKit.getInstance() as MusicKit.MusicKitInstanceLoose;

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

  void fetchJamIdentity().then((participant) => {
    identity.value = participant;
  });

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
