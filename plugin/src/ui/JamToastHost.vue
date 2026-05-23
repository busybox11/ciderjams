<script setup lang="ts">
import { useJamToasts } from "./toasts";

const { toasts } = useJamToasts();
</script>

<template>
  <div class="ciderjams-toast-host" aria-live="polite">
    <TransitionGroup name="ciderjams-toast">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="ciderjams-toast"
      >
        <strong v-if="toast.title" class="ciderjams-toast-title">{{ toast.title }}</strong>
        <span class="ciderjams-toast-message">{{ toast.message }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.ciderjams-toast-host {
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  z-index: 100000;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.5rem;
  pointer-events: none;
  max-width: min(20rem, calc(100vw - 2rem));
}

.ciderjams-toast {
  padding: 0.625rem 0.875rem;
  border-radius: 0.5rem;
  background: oklch(22% 0.02 260 / 0.92);
  border: 1px solid oklch(100% 0 0 / 0.12);
  box-shadow: 0 4px 16px oklch(0% 0 0 / 0.35);
  color: #fff;
  font-size: 0.8125rem;
  line-height: 1.35;
}

.ciderjams-toast-title {
  display: block;
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  opacity: 0.65;
  margin-bottom: 0.2rem;
}

.ciderjams-toast-message {
  display: block;
}

.ciderjams-toast-enter-active,
.ciderjams-toast-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.ciderjams-toast-enter-from,
.ciderjams-toast-leave-to {
  opacity: 0;
  transform: translateY(0.5rem);
}
</style>
