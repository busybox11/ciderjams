import { ref } from "vue";

export type JamToast = {
  id: number;
  message: string;
  title?: string;
};

const TOAST_DURATION_MS = 4000;

let nextId = 0;
const toasts = ref<JamToast[]>([]);

export function showJamToast(message: string, title?: string): void {
  const id = ++nextId;
  toasts.value = [...toasts.value, { id, message, title }];
  setTimeout(() => {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }, TOAST_DURATION_MS);
}

export function useJamToasts() {
  return { toasts };
}
