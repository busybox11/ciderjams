<script setup lang="ts">
import { useCider, useMusicKit } from "@ciderapp/pluginkit";
import CComponent from "@ciderapp/pluginkit/vue/CComponent.vue";
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useMainStore } from "../stores/main";
import ContextMenuExample from "./ContextMenuExample.vue";

const store = useMainStore();
const cider = useCider();
const musicKit = useMusicKit();

const buttonAction = async () => {
  cider.musicKitStore.shuffleMode = 0;
  musicKit.shuffleMode = 0;
  musicKit.repeatMode = 0;
  await musicKit.setQueue({
    songs: [
      "i.06QkVx0T0KQRBxl",
      "i.xrXkxZLUMxbGpeK",
      "i.06QdQzNH0KQRBxl",
      "i.vMXGZ0EfgODmekV",
      "i.rXze6a6TMWGoqlm",
      "i.7PJVWzEH0BL25zr",
      "i.EYVBpJbsmXvqLN8",
    ],
    startPosition: 0,
  });
  await musicKit.play();

  console.log(cider.musicKitStore.queueHash);
};

// Get the external component definition
const ChromeButton = (window as any).__PLUGINSYS__?.App?.Components
  ?.ChromeButton;

// Ref to the container where we'll mount the button
const chromeButtonContainer = ref<HTMLElement | null>(null);

onMounted(() => {
  if (chromeButtonContainer.value && ChromeButton) {
    // Get Cider's Vue instance and its functions
    (window as any).__PLUGINSYS__.App.RenderComponent({
      component: "ChromeButton",
      element: chromeButtonContainer.value,
      props: {
        title: "Cider Jams",
        nativeTitle: "Cider Jams",
        active: true,
      },
    });
  }
});

onBeforeUnmount(() => {
  // Clean up the rendered component using Cider's render function
  const CiderVue = (window as any).__PLUGINSYS__?.App?.vue;
  if (CiderVue && chromeButtonContainer.value) {
    const { render } = CiderVue;
    render(null, chromeButtonContainer.value);
  }
});
</script>

<template>
  <div class="plugin-base">
    <!-- Container where ChromeButton will be mounted -->
    <div ref="chromeButtonContainer"></div>
    Hello world! this is a test
    <br />
    <button class="c-btn primary" @click="buttonAction">
      click to play album
    </button>
    <br />
    (doubled: {{ store.doubled }})
    <ContextMenuExample />
    <CComponent
      name="ChromeButton"
      :componentProps="{
        title: 'Cider Jams',
        nativeTitle: 'Cider Jams',
        active: true,
      }"
    >
      <div slot="default"><span> Cider Jams </span></div>
    </CComponent>
  </div>
</template>

<style scoped></style>
