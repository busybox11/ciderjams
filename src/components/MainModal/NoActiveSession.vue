<script setup lang="ts">
import CComponent from "@ciderapp/pluginkit/vue/CComponent.vue";
</script>

<template>
  <div class="plugin-base">
    <h3 class="ciderjams-title">Group listening session</h3>
    <p>Listen to music together with your friends</p>

    <hr class="ciderjams-divider" />

    <div class="ciderjams-buttons">
      <button class="c-btn primary" @click="">
        Create session
      </button>
      <button class="c-btn primary" @click="">
        Join session
      </button>

      <button class="ciderjams-icon-button">
        <CComponent
          name="NIcon"
          :componentProps="{
            name: 'settings',
          }"
        />
      </button>
    </div>
  </div>
</template>

<style scoped>
.plugin-base {
  padding: 0.75rem 1rem;

  width: 25rem;
}

.ciderjams-title {
  margin: 0 !important;
  font-size: 1.4rem;
  line-height: 1.4;
  font-weight: 700;
}

p {
  margin-bottom: 0;
}

.ciderjams-divider {
  margin: 1rem 0;
  border: none;
  border-top: 1px solid #e0e0e030;
}

.ciderjams-buttons {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
}

.ciderjams-icon-button {
  background: none !important;
  border: none !important;
  box-shadow: none !important;
  cursor: pointer;
  display: flex;
  margin-left: auto;
  padding: 0.25rem;
}
</style>
