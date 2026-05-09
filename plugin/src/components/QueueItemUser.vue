<script setup lang="ts">
import { useJamStore } from "../stores/main";

const props = defineProps<{
  item: MusicKit.MediaItem; 
}>();

const jamStore = useJamStore();

const currentJam = computed(() => jamStore.currentJam);
</script>

<template>
  <div class="queue-item-user" v-if="currentJam">
    <img src="https://cdn.discordapp.com/avatars/750770863418376216/f20db21adc47f1c0d92bba4042ae8aef.webp?size=240" alt="Member 3" style="width: 1.5rem; height: 1.5rem; border-radius: 50%; display: flex; margin-left: 0.5rem;" />
  </div>
</template>

<style scoped>
.queue-item-user {
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>