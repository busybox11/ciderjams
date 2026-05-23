<script setup lang="ts">
import CComponent from "@ciderapp/pluginkit/vue/CComponent.vue";

import { useJamStore } from "../../session/store";

const jamStore = useJamStore();

const currentJamOwner = computed(() => {
  const jam = jamStore.currentJam;
  if (!jam) return undefined;
  return jam.participants.find((m) => m.userId === jam.hostUserId);
});
</script>

<template>
  <div class="menu-indicator" :class="{ 'active': currentJamOwner }">
    <CComponent
      name="NIcon"
      :componentProps="{
        name: 'share',
      }"
    />

    <img
      v-if="currentJamOwner"
      :src="currentJamOwner.avatar"
      :alt="currentJamOwner.name"
      class="menu-indicator-avatar"
    />
  </div>
</template>

<style>
.chrome-button[sfc-name="PluginBaseButton"]:has(.menu-indicator.active) {
  background-color: #00ff333a !important;
}
</style>

<style scoped>
.menu-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
}

.menu-indicator-avatar {
  position: absolute;
  top: -0.3rem;
  right: -0.3rem;
  height: 1.2rem;
  width: 1.2rem;
  border-radius: 100%;
}
</style>
