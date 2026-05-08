<script setup lang="ts">
import { useJamStore } from "../../stores/main";

import NoActiveSession from "./Views/NoActiveSession.vue";
import SessionInfo from "./Views/SessionInfo.vue";

const jamStore = useJamStore();

const currentJam = computed(() => jamStore.currentJam);
</script>

<template>
  <NoActiveSession v-if="!currentJam" />
  <SessionInfo v-else-if="currentJam" />
</template>

<style scoped>
</style>
