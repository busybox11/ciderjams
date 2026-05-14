<script setup lang="ts">
const props = defineProps<{
  title: string;
  description: string;
}>();
</script>

<template>
  <h3 class="ciderjams-title">{{ title }}</h3>
  <p class="ciderjams-description">{{ description }}</p>
</template>

<style scoped>
.ciderjams-title {
  margin: 0 !important;
  font-size: 1.4rem;
  line-height: 1.4;
  font-weight: 700;
}

.ciderjams-description {
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.2;
  color: #a1a1a1;
}
</style>