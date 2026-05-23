import { watch } from "vue";

import { apiBaseUrlRef, DEFAULT_API_BASE_URL, normalizeApiBaseUrl } from "../api/base-url";

export type PluginUserConfig = {
  apiBaseUrl: string;
};

// pluginkit setupConfig return type is inferred at the call site
type SetupConfig = (defaults: PluginUserConfig) => { value: PluginUserConfig };

let cfg: { value: PluginUserConfig };

export function installPluginConfig(setupConfig: SetupConfig) {
  cfg = setupConfig({
    apiBaseUrl: DEFAULT_API_BASE_URL,
  });

  watch(
    () => cfg.value.apiBaseUrl,
    (url) => {
      apiBaseUrlRef.value = normalizeApiBaseUrl(url || DEFAULT_API_BASE_URL);
    },
    { immediate: true },
  );
}

export function useConfig(): PluginUserConfig {
  return cfg.value;
}
