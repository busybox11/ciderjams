<script setup lang="ts">
import { useCider, useMusicKit } from "@ciderapp/pluginkit";
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
</script>

<template>
  <div class="plugin-base">
    Hello world!
    <br />
    <button class="c-btn primary" @click="buttonAction">
      click to play album
    </button>
    <br />
    (doubled: {{ store.doubled }})
    <ContextMenuExample />
  </div>
</template>

<style scoped></style>
