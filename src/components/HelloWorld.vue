<script setup lang="ts">
import { ref } from "vue";

const showNoActiveSession = ref(false);

import NoActiveSession from "./MainModal/NoActiveSession.vue";
import SessionInfo from "./MainModal/SessionInfo.vue";
</script>

<template>
  <NoActiveSession v-if="showNoActiveSession" />
  <SessionInfo v-else />
</template>

<style scoped>
</style>
