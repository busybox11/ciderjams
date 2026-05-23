<script setup lang="ts">
import { useJamStore } from "../../stores/main";
import NoActiveSession from "./Views/NoActiveSession.vue";
import SessionInfo from "./Views/SessionInfo.vue";

const jamStore = useJamStore();

const currentJam = computed(() => jamStore.currentJam);
</script>

<template>
  <div class="ciderjams-bg-overlay" :class="{ 'active': currentJam }"></div>

  <NoActiveSession v-if="!currentJam" />
  <SessionInfo v-else-if="currentJam" />
</template>

<style scoped>
.ciderjams-bg-overlay {
  background: radial-gradient(circle at top left, oklch(85% 0.30 150 / 0.15) -80%, oklch(85% 0.30 150 / 0.0) 90%);
  opacity: 0;
  transition: opacity 1s ease-out;
  will-change: opacity;

  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: -2;
}
.ciderjams-bg-overlay.active {
  opacity: 1;
}
</style>
