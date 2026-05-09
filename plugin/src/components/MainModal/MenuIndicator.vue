<script setup lang="ts">
import CComponent from "@ciderapp/pluginkit/vue/CComponent.vue";
import { useJamStore } from "../../stores/main";

const jamStore = useJamStore();

const currentJamOwner = computed(() => jamStore.currentJam?.members.find((member) => member.isOwner));
</script>

<template>
  <div class="menu-indicator" :class="{ 'active': currentJamOwner }">
    <CComponent
      name="NIcon"
      :componentProps="{
        name: 'share',
      }"
    />

    <img :src="currentJamOwner?.avatar" class="menu-indicator-avatar" v-if="currentJamOwner" />
  </div>
</template>

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
