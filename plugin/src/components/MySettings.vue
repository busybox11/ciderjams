<script setup lang="ts">
import type { ComponentNames } from "@ciderapp/pluginkit";

import { reactive, watch } from "vue";

import CComponent from "@ciderapp/pluginkit/vue/CComponent.vue";

import { DEFAULT_API_BASE_URL } from "../lib/api-base-url";
import { useConfig } from "../main";

const cfg = useConfig();

const cInputName = "CInput" as ComponentNames;

const apiUrlInputProps = reactive({
  modelValue: cfg.apiBaseUrl,
  placeholder: DEFAULT_API_BASE_URL,
  type: "url",
  spellcheck: false,
  autocomplete: "off",
  "onUpdate:modelValue"(value: string) {
    apiUrlInputProps.modelValue = value;
    cfg.apiBaseUrl = value;
  },
});

watch(
  () => cfg.apiBaseUrl,
  (url) => {
    if (apiUrlInputProps.modelValue !== url) {
      apiUrlInputProps.modelValue = url;
    }
  },
);
</script>

<template>
  <div class="q-px-lg plugin-base">
    <h2 class="apple-heading">Cider Jams</h2>

    <label class="settings-field">
      <span class="settings-label">API server URL</span>
      <CComponent :name="cInputName" :componentProps="apiUrlInputProps" />
    </label>
  </div>
</template>

<style scoped>
.plugin-base {
  padding: 0.5rem;
  max-width: 28rem;
}

.apple-heading {
  margin: 0 0 1rem;
  font-size: 1.25rem;
  font-weight: 600;
}

.settings-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.settings-label {
  font-size: 0.85rem;
  opacity: 0.85;
}
</style>
