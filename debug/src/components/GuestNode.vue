<script setup lang="ts">
import type { PlayerStateSchema, QueueStateSchema } from "@ciderjams/proto";
import type { SharePlayPublishedMediaState } from "@shareplay/types";

import { onMounted, onUnmounted, ref, shallowRef } from "vue";

import { serverWireMessageSchema } from "@ciderjams/proto";

import { jamPlaybackToSharePlayPayload } from "@plugin/lib/jam/from-server";

import { MockGuestAdapter } from "../MockPlayerAdapter";

const adapter = new MockGuestAdapter();

const isInjected = ref(false);
const lastPublishedState = ref<SharePlayPublishedMediaState | null>(null);

const lastQueueState = shallowRef<QueueStateSchema | null>(null);
const lastPlayerState = shallowRef<PlayerStateSchema | null>(null);

onMounted(() => {
  adapter.inject({
    onInjected: () => (isInjected.value = true),
    onEjected: () => (isInjected.value = false),
    onMediaStatePublished: (payload) => {
      lastPublishedState.value = payload;
    },
  });
});

onUnmounted(() => {
  adapter.eject();
});

async function flushGuestSync() {
  const q = lastQueueState.value;
  const p = lastPlayerState.value;
  if (!q?.length || !p) return;
  await adapter.syncFromServer(jamPlaybackToSharePlayPayload(q, p));
}

const receiveFromServer = async (message: unknown) => {
  const parsed = serverWireMessageSchema.safeParse(message);
  if (!parsed.success) return;
  const msg = parsed.data;
  if ("type" in msg) return;

  if (msg.event === "queue.state") {
    lastQueueState.value = msg.payload as QueueStateSchema;
    await flushGuestSync();
    return;
  }
  if (msg.event === "player.state") {
    lastPlayerState.value = msg.payload as PlayerStateSchema;
    await flushGuestSync();
  }
};

defineExpose({
  receiveFromServer,
});
</script>

<template>
  <div class="panel guest-panel">
    <h2>Guest Adapter</h2>
    <div class="state">
      <p>Status: {{ isInjected ? "Injected" : "Ejected" }}</p>

      <h3>Last Published State (to fake MusicKit)</h3>
      <pre v-if="lastPublishedState">{{ JSON.stringify(lastPublishedState, null, 2) }}</pre>
      <p v-else>No state received yet</p>
    </div>
  </div>
</template>

<style scoped>
.panel {
  border: 1px solid #60a5fa;
  padding: 1rem;
  border-radius: 8px;
  background: #1a1a2e;
}
.guest-panel {
  border-color: #60a5fa;
}
pre {
  background: #0f0f1a;
  padding: 0.5rem;
  overflow-x: auto;
  font-size: 0.8rem;
}
</style>
