<script setup lang="ts">
import { DialogAPI, useCider } from "@ciderapp/pluginkit";
import { computed } from "vue";
import HelloWorld from "../components/HelloWorld.vue";


const openComponentDialog = () => {
  DialogAPI.createDialog({
    component: 'plugin-template-component-based-modal',
  }).show();
};

const cfg = computed(() => {
  return useCider().config.getRef();
});

</script>

<template>
  <div class="q-pa-lg plugin-base">
    <h1 class="apple-heading">My Custom Plugin Page</h1>
    {{ cfg.general.displayName }}

    <p>This is a custom page. You can add your own content here.</p>
    <HelloWorld></HelloWorld>

    <button
      class="c-btn"
      @click="openComponentDialog"
    >Show component based modal</button>
  </div>
</template>

<style scoped></style>
