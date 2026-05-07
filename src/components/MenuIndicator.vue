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

    <img src="https://avatars.githubusercontent.com/u/29630035" class="menu-indicator-avatar" />
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
