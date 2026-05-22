<script setup lang="ts">
import type {
  PlayerStateSchema,
  QueueStateSchema,
  RoomStateSchema,
  roomParticipant,
} from "@ciderjams/proto";
import { outboundWsMessageSchema } from "@ciderjams/proto";
import { ciderSyncSocket, type CiderSyncSocket } from "@plugin/lib/api";
import { DebugJamHostPlayerAdapter } from "@plugin/lib/jam/adapters/debug";
import {
  startJamHostSession,
  waitForWebSocketOpen,
  type JamHostSessionHandle,
} from "@plugin/lib/jam/session";
import { ManualJamHostSyncSource } from "@plugin/lib/jam/sync-manual";
import { computed, onUnmounted, ref, shallowRef } from "vue";

/** Same throttle as `SharePlayHost` for `playbackTimeDidChange`. */
const PLAYBACK_TIME_SYNC_MS = 10_000;

const DEBUG_PARTICIPANT: roomParticipant = {
  userId: "debug-host-user",
  name: "Debug Host",
  handle: "debug",
  avatar: "https://pbs.twimg.com/profile_images/2034808232947195904/86A9CeNc_400x400.jpg",
};

const socketRef = shallowRef<CiderSyncSocket | null>(null);
const sessionRef = shallowRef<JamHostSessionHandle | null>(null);
const playerAdapter = new DebugJamHostPlayerAdapter();
const manualSync = new ManualJamHostSyncSource();

const connected = ref(false);
const roomCode = ref<string | null>(null);
const trackIdInput = ref("");
const seekMsInput = ref(0);

const playing = ref(false);
const queuePreview = ref<string[]>([]);
const elapsedMsDisplay = ref(0);

let playbackTicker: ReturnType<typeof setInterval> | null = null;
let lastTickerWallMs = 0;
/** Wall clock of last `player.host.sync` push (matches SharePlayHost `lastPlaybackSync`). */
let lastPlaybackPushWallMs = 0;

const lastRoomState = shallowRef<RoomStateSchema | null>(null);
const lastQueueState = shallowRef<QueueStateSchema | null>(null);
const lastPlayerState = shallowRef<PlayerStateSchema | null>(null);

/** Mirrors server `Room.previous` / `Room.next` “meaningful skip” rules. */
const skipAvailability = computed(() => {
  const qlen =
    lastQueueState.value?.length ?? playerAdapter.getQueueSnapshot().length;
  if (!connected.value || qlen === 0) {
    return { previous: false, next: false };
  }
  const p = lastPlayerState.value;
  if (!p) {
    return { previous: true, next: true };
  }
  const lastIdx = qlen - 1;
  const previous =
    p.currentPlayingIndex > 0 || p.repeatMode === "REPEAT_ALL";
  const next =
    p.currentPlayingIndex < lastIdx ||
    p.repeatMode === "REPEAT_ALL" ||
    p.repeatMode === "REPEAT_ONE";
  return { previous, next };
});

function syncUi() {
  queuePreview.value = playerAdapter.getQueueSnapshot();
  playing.value = playerAdapter.isPlaying;
  elapsedMsDisplay.value = playerAdapter.elapsedTimeMs;
}

function pushPlaybackSync() {
  manualSync.triggerPlaybackSync();
  lastPlaybackPushWallMs = Date.now();
}

function stopPlaybackTicker() {
  if (playbackTicker != null) clearInterval(playbackTicker);
  playbackTicker = null;
}

function startPlaybackTicker() {
  stopPlaybackTicker();
  lastTickerWallMs = performance.now();
  playbackTicker = setInterval(() => {
    const nowPerf = performance.now();
    const dt = nowPerf - lastTickerWallMs;
    lastTickerWallMs = nowPerf;

    if (!connected.value || !socketRef.value) return;

    if (playerAdapter.isPlaying) {
      playerAdapter.advanceElapsedMs(dt);
      syncUi();

      const wallNow = Date.now();
      if (wallNow - lastPlaybackPushWallMs >= PLAYBACK_TIME_SYNC_MS) {
        pushPlaybackSync();
      }
    }
  }, 250);
}

function onSocketData(data: unknown) {
  const parsed = outboundWsMessageSchema.safeParse(data);
  if (!parsed.success) return;
  const msg = parsed.data;
  if ("type" in msg) return;
  if (msg.event === "room.state") {
    const p = msg.payload as RoomStateSchema;
    lastRoomState.value = p;
    roomCode.value = p.roomCode;
    return;
  }
  if (msg.event === "queue.state") {
    lastQueueState.value = msg.payload as QueueStateSchema;
    return;
  }
  if (msg.event === "player.state") {
    const p = msg.payload as PlayerStateSchema;
    lastPlayerState.value = p;
    playerAdapter.applyServerPlayerState(p);
    seekMsInput.value = p.elapsedTimeMs;
    lastPlaybackPushWallMs = Date.now();
    syncUi();
  }
}

async function createRoom() {
  if (socketRef.value) return;

  const client = ciderSyncSocket(DEBUG_PARTICIPANT);
  socketRef.value = client;
  client.subscribe((ev) => onSocketData(ev.data));
  await waitForWebSocketOpen(client);
  connected.value = true;

  sessionRef.value = startJamHostSession({
    socket: client,
    getLastJamQueue: () => lastQueueState.value,
    getLastJamPlayer: () => lastPlayerState.value,
    playerAdapter,
    syncSource: manualSync,
  });
  lastPlaybackPushWallMs = Date.now();
  startPlaybackTicker();
  syncUi();
}

function leaveRoom() {
  stopPlaybackTicker();
  sessionRef.value?.stop();
  sessionRef.value = null;

  const s = socketRef.value;
  if (s?.ws.readyState === WebSocket.OPEN && lastRoomState.value) {
    s.send({ event: "room.leave", payload: {} });
  }
  s?.close();
  socketRef.value = null;

  connected.value = false;
  roomCode.value = null;
  lastRoomState.value = null;
  lastQueueState.value = null;
  lastPlayerState.value = null;
}

function addTrack() {
  playerAdapter.addTrack(trackIdInput.value);
  trackIdInput.value = "";
  manualSync.triggerQueueSync();
  syncUi();
}

function togglePlayPause() {
  if (playerAdapter.getQueueSnapshot().length === 0) return;
  if (playerAdapter.isPlaying) playerAdapter.pause();
  else playerAdapter.play();
  pushPlaybackSync();
  syncUi();
}

function sendSkipPrevious() {
  const s = socketRef.value;
  if (!s || s.ws.readyState !== WebSocket.OPEN) return;
  s.send({ event: "player.previous", payload: {} });
}

function sendSkipNext() {
  const s = socketRef.value;
  if (!s || s.ws.readyState !== WebSocket.OPEN) return;
  s.send({ event: "player.next", payload: {} });
}

function applySeek() {
  const n = Number(seekMsInput.value);
  if (Number.isNaN(n)) return;
  playerAdapter.seek(n);
  pushPlaybackSync();
  syncUi();
}

onUnmounted(() => leaveRoom());
</script>

<template>
  <div class="panel host-panel">
    <h2>Debug Host</h2>

    <div class="controls">
      <button type="button" @click="createRoom" :disabled="connected">
        Create room
      </button>
      <button type="button" @click="leaveRoom" :disabled="!connected">
        Leave
      </button>
    </div>

    <p v-if="roomCode">Room code: {{ roomCode }}</p>
    <p v-else-if="connected">Waiting for room.state…</p>

    <div class="row">
      <input
        v-model="trackIdInput"
        :disabled="!connected"
        placeholder="Catalog track id"
      />
      <button type="button" :disabled="!connected" @click="addTrack">
        Add to queue
      </button>
    </div>

    <div class="row skip-row">
      <button
        type="button"
        :disabled="!connected || !skipAvailability.previous"
        @click="sendSkipPrevious"
      >
        Previous
      </button>
      <button
        type="button"
        :disabled="!connected || !skipAvailability.next"
        @click="sendSkipNext"
      >
        Next
      </button>
    </div>

    <div class="row">
      <button type="button" :disabled="!connected" @click="togglePlayPause">
        {{ playing ? "Pause" : "Play" }}
      </button>
      <span class="elapsed-hint">Adapter elapsed: {{ elapsedMsDisplay }} ms</span>
      <label>
        Seek ms
        <input v-model.number="seekMsInput" type="number" min="0" step="100" :disabled="!connected" />
      </label>
      <button type="button" :disabled="!connected" @click="applySeek">
        Seek
      </button>
    </div>

    <div class="state">
      <h3>Last player.state</h3>
      <pre v-if="lastPlayerState">{{ JSON.stringify(lastPlayerState, null, 2) }}</pre>
      <p v-else>—</p>
    </div>

    <div class="state">
      <h3>Adapter queue</h3>
      <pre>{{ JSON.stringify(queuePreview, null, 2) }}</pre>
      <h3>Last queue.state</h3>
      <pre v-if="lastQueueState">{{ JSON.stringify(lastQueueState, null, 2) }}</pre>
      <p v-else>—</p>
    </div>
    
    <div class="state">
      <h3>Last room.state</h3>
      <pre v-if="lastRoomState">{{ JSON.stringify(lastRoomState, null, 2) }}</pre>
      <p v-else>—</p>
    </div>
  </div>
</template>

<style scoped>
.panel {
  padding: 1rem;
  background: #1a1a2e;
}
.controls,
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 1rem;
}
.elapsed-hint {
  font-size: 0.85rem;
  color: #94a3b8;
}
button {
  padding: 0.25rem 0.5rem;
  background: #333;
  color: #fff;
  border: 1px solid #666;
  cursor: pointer;
}
button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
input[type="text"],
input[type="number"] {
  background: #0f0f1a;
  color: #eee;
  border: 1px solid #444;
  padding: 0.25rem 0.5rem;
}
pre {
  background: #0f0f1a;
  padding: 0.5rem;
  overflow-x: auto;
  font-family: "Cascadia Code", var(--mono);
  font-size: 0.8rem;
  letter-spacing: 0.01em;
  line-height: 1.2;
  text-align: left;
}
</style>
