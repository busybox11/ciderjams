<script setup lang="ts">
import type { roomParticipant } from '@ciderjams/proto';

defineProps<{
  member: roomParticipant;
}>();
</script>

<template>
  <div class="ciderjams-identity">
    <img :src="member.avatar" class="ciderjams-identity-avatar" />
    <div class="ciderjams-identity-info">
      <span class="ciderjams-identity-name">{{ member.name }}</span>
      <span class="ciderjams-identity-username">@{{ member.handle }}</span>
    </div>
  </div>
</template>

<style scoped>
.ciderjams-identity {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0.75rem;
  width: 100%;
}

.ciderjams-identity-avatar {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
}

.ciderjams-identity-info {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  width: 100%;
}

.ciderjams-identity-name {
  font-size: 1rem;
  font-weight: 600;
  line-height: 1;
}

.ciderjams-identity-username {
  font-size: 0.75rem;
  opacity: 0.6;
  font-family: monospace;
}
</style>