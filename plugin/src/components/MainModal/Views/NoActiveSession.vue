<script setup lang="ts">
import CComponent from "@ciderapp/pluginkit/vue/CComponent.vue";

import JamMemberListItem from "../../shared/JamMemberListItem.vue";
import ModalHeader from "../../shared/ModalHeader.vue";

import { log } from "../../../lib/logger";
import { useJamStore } from "../../../stores/main";

const jamStore = useJamStore();

const createJam = async () => {
  try {
    await jamStore.createJam();
  } catch (e) {
    log.error(e);
  }
};

const roomCode = ref("");
const joinJam = async () => {
  try {
    await jamStore.joinJam(roomCode.value);
  } catch (e) {
    log.error(e);
  }
};
</script>

<template>
  <div class="plugin-base">
    <ModalHeader title="Group listening session" description="Listen to music together with your friends" />

    <JamMemberListItem :member="jamStore.identity" v-if="jamStore.identity" />

    <hr class="ciderjams-divider" />

    <div class="ciderjams-buttons">
      <button class="c-btn primary" @click="createJam">
        Create session
      </button>

      <div class="ciderjams-input-container">
        <input type="text" class="c-input ciderjams-input" placeholder="Enter session code" v-model="roomCode" @keyup.enter="joinJam" />

        <button class="ciderjams-join-button" @click="joinJam">
          <CComponent
            name="NIcon"
            :componentProps="{
              name: 'search',
            }"
          />
        </button>
      </div>
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

.ciderjams-input-container {
  flex: 1;
  display: flex;
  align-items: center;

  border: 1px solid #e0e0e030;
  border-radius: 0.5rem;
}

.ciderjams-input {
  width: 100% !important;
  border-radius: 0;
  border: none !important;
  padding: 5px 10px !important;
}

.ciderjams-join-button {
  height: 33px;
  width: 33px;
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0 0.5rem 0.5rem 0;
  background: #e0e0e020;
  border: none !important;
  box-shadow: none !important;
}
</style>
