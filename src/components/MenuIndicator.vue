<script setup lang="ts">
import CComponent from "@ciderapp/pluginkit/vue/CComponent.vue";
</script>

<template>
  <div class="menu-indicator">
    <CComponent
      name="NIcon"
      :componentProps="{
        name: 'share',
      }"
    />
  </div>
</template>

<style scoped>
.menu-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
