<script setup lang="ts">
import CComponent from "@ciderapp/pluginkit/vue/CComponent.vue";
import { useJamStore } from "../../stores/main";

const jamStore = useJamStore();

const currentJam = computed(() => jamStore.currentJam);

const leaveSession = () => {
  jamStore.currentJam = null;
}
</script>

<template>
  <div class="plugin-base">
    <h3 class="ciderjams-title">Listening session</h3>
    <p class="ciderjams-session-info">Connected - {{ currentJam?.members.length }} members</p>

    <div class="ciderjams-session-members">
      <div class="ciderjams-session-member" v-for="member in currentJam?.members" :key="member.id">
        <img :src="member.avatar" :alt="member.name" />
        <div class="ciderjams-session-member-info">
          <p class="ciderjams-session-member-name">{{ member.name }}</p>
          <p class="ciderjams-session-member-username">@{{ member.username }}</p>
        </div>
      </div>
    </div>

    <hr class="ciderjams-divider" />

    <div class="ciderjams-buttons">
      <button class="c-btn primary" @click="leaveSession">
        Leave session
      </button>

      <div class="ciderjams-icon-buttons">  
        <div class="ciderjams-room-code-container">
          <small>Room code</small>
        <span class="ciderjams-room-code">{{ currentJam?.code }}</span>
      </div>
        <button class="ciderjams-icon-button">
          <CComponent
            name="NIcon"
            :componentProps="{
              name: 'share',
            }"
          />
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

.ciderjams-session-info {
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.2;
  color: #a1a1a1;
}

p {
  margin-bottom: 0;
}

.ciderjams-session-members {
  margin: 1rem 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
}

.ciderjams-session-member {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
}
.ciderjams-session-member img {
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 50%;
}

.ciderjams-session-member-name {
  margin: 0;
  font-size: 1rem;
  line-height: 1.2;
  padding-bottom: 0.125rem;
  font-weight: 600;
}

.ciderjams-session-member-username {
  margin: 0;
  font-size: 0.75rem;
  font-family: monospace;
  opacity: 0.5;
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

.ciderjams-icon-buttons {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-left: auto;
}

.ciderjams-room-code-container {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.25rem;
}

.ciderjams-room-code-container small {
  font-size: 0.625rem;
  line-height: 0.8;
  opacity: 0.5;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.ciderjams-room-code {
  color: #ffffff;
  line-height: 1;
  opacity: 0.75;

  font-family: monospace;
}

.ciderjams-icon-button {
  background: none !important;
  border: none !important;
  box-shadow: none !important;
  cursor: pointer;
  display: flex;
  padding: 0.25rem;
}
</style>
