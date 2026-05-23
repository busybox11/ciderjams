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
import {
  createJamInboundSync,
  jamPlaybackToSharePlayPayload,
} from "../lib/jam/from-server";
import { JamGuestActions } from "../lib/jam/guest-actions";
import {
  startJamHostSession,
  waitForWebSocketOpen,
  type JamHostSessionHandle,
} from "../lib/jam/session";
import { log } from "../lib/logger";
import {
  jamErrorMessage,
  showJamAlert,
  showJamMemberEvent,
} from "../lib/notifications";
import { useSharePlayStore } from "./shareplay";

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
    getMusicKit: () =>
      MusicKit.getInstance() as MusicKit.MusicKitInstanceLoose | null,
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
      return share.syncFromServer(
        jamPlaybackToSharePlayPayload(queue, player),
      )!;
    },
  });

  // --- socket ---
  function detachSocket() {
    socket.value?.close();
    socket.value = null;
  }

  async function getConnectedSocket(): Promise<CiderSyncSocket> {
    if (!identity.value) throw new Error("You are not logged in");

    detachSocket();
    const client = ciderSyncSocket(identity.value);
    socket.value = client;
    client.subscribe((ev) => onSocketMessage(ev.data));
    await waitForWebSocketOpen(client);
    return client;
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
      log.error("Jam socket error:", msg.message);
      const { message, title } = jamErrorMessage(msg.message);
      if (pendingRoomJoin.value && !currentJam.value) {
        pendingRoomJoin.value = false;
        abortPendingJoin();
        showJamAlert(message, title);
        return;
      }
      if (currentJam.value) showJamAlert(message, title);
      return;
    }

    switch (msg.event) {
      case "room.state":
        applyRoomState(msg.payload as RoomStateSchema);
        break;
      case "queue.state": {
        const prev = lastQueueState.value;
        lastQueueState.value = msg.payload as QueueStateSchema;
        inboundSync.onQueueState(lastQueueState.value, prev);
        break;
      }
      case "player.state":
        lastPlayerState.value = msg.payload as PlayerStateSchema;
        inboundSync.onPlayerState();
        break;
      default:
        break;
    }
  }

  function applyRoomState(payload: RoomStateSchema) {
    const prev = currentJam.value;
    pendingRoomJoin.value = false;

    if (prev) {
      const hostGone =
        !isHost() &&
        !payload.participants.some((p) => p.userId === prev.hostUserId);
      if (hostGone) {
        showJamAlert("The host ended the listening session.", "Session ended");
        leaveJam();
        return;
      }
      notifyParticipantChanges(prev, payload);
    }

    currentJam.value = payload;
  }

  function notifyParticipantChanges(
    prev: RoomStateSchema,
    next: RoomStateSchema,
  ) {
    const me = identity.value?.userId;
    const prevIds = new Set(prev.participants.map((p) => p.userId));
    const nextIds = new Set(next.participants.map((p) => p.userId));

    for (const p of next.participants) {
      if (!prevIds.has(p.userId) && p.userId !== me) {
        showJamMemberEvent(`${p.name} joined the session.`, "Member joined");
      }
    }

    for (const p of prev.participants) {
      if (
        !nextIds.has(p.userId) &&
        p.userId !== me &&
        p.userId !== prev.hostUserId
      ) {
        showJamMemberEvent(`${p.name} left the session.`, "Member left");
      }
    }
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

    if (!identity.value) {
      await refreshIdentity();
      if (!identity.value) {
        throw new Error("Could not load Apple Music profile");
      }
    }

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

  async function refreshIdentity() {
    try {
      const musicKit = useMusicKit();
      const result = await musicKit.api.personalSocialProfile();
      const handle = result.attributes.handle;
      const resource = result as { id?: string };

      // TODO: remove this - only for multi platform debug
      const isLinux = window.navigator.userAgent
        .toLowerCase()
        .includes("linux");

      if (isLinux) {
        identity.value = {
          userId:
            typeof resource.id === "string" && resource.id.length > 0
              ? `${resource.id}-linux`
              : `handle:${handle}-linux`,
          name: `${result.attributes.name} (Linux)`,
          handle: `${handle}-linux`,
          avatar:
            "https://pbs.twimg.com/profile_images/1994727967587528704/p5QVaU0q_400x400.jpg",
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
