<script setup lang="ts">
import { useJamStore } from "../stores/main";

const props = defineProps<{
  item: MusicKit.MediaItem;
}>();

const jamStore = useJamStore();

const currentQueueState = computed(() => jamStore.lastQueueState);

const currentJam = computed(() => jamStore.currentJam);
const jamTrack = computed(() => {
  if (!currentQueueState.value) return null;
  const ownerId = currentQueueState.value.find((q) => q.itemCatalogId === props.item.id)?.ownerUserId;
  if (!ownerId) return null;
  return currentJam.value?.participants.find((p) => p.userId === ownerId);
});
</script>

<template>
  <div class="queue-item-user" v-if="jamTrack">
    <img :src="jamTrack.avatar" alt="Member 3" style="width: 1.5rem; height: 1.5rem; border-radius: 50%; display: flex; margin-left: 0.5rem;" />
  </div>
</template>

<style scoped>
.queue-item-user {
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>