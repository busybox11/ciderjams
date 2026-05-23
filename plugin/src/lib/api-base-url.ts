import { ref } from "vue";

/** default jam sync server (local dev) */
export const DEFAULT_API_BASE_URL = "http://localhost:8787";

export const apiBaseUrlRef = ref(DEFAULT_API_BASE_URL);

export function normalizeApiBaseUrl(url: string): string {
  return url.trim().replace(/\/$/, "");
}

export function getApiBaseUrl(): string {
  const raw = apiBaseUrlRef.value || DEFAULT_API_BASE_URL;
  return normalizeApiBaseUrl(raw);
}
