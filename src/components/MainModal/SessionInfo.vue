<script setup lang="ts">
import CComponent from "@ciderapp/pluginkit/vue/CComponent.vue";

const leaveSession = () => {
  const queueListDOM = document.body.querySelector('.queue-item-list');
  if (queueListDOM) {
    const queueItems = queueListDOM.querySelectorAll('.queue-item');
    queueItems.forEach(item => {
      const itemMetadataEl = item.querySelector('.queue-item-metadata');
      if (itemMetadataEl) {
        // add element after this one
        const newElement = document.createElement('div');
        newElement.innerHTML = '<img src="https://cdn.discordapp.com/avatars/750770863418376216/f20db21adc47f1c0d92bba4042ae8aef.webp?size=240" alt="Member 3" style="width: 1.5rem; height: 1.5rem; border-radius: 50%;" />';
        itemMetadataEl.after(newElement);
      }
    });
  }
}
</script>

<template>
  <div class="plugin-base">
    <h3 class="ciderjams-title">Listening session</h3>
    <p class="ciderjams-session-info">Connected - 3 members</p>

    <div class="ciderjams-session-members">
      <div class="ciderjams-session-member">
        <img src="https://avatars.githubusercontent.com/u/29630035" alt="Member 1" />
        <div class="ciderjams-session-member-info">
          <p class="ciderjams-session-member-name">rain capsule</p>
          <p class="ciderjams-session-member-username">@raincapsule</p>
        </div>
      </div>
      <div class="ciderjams-session-member">
        <img src="https://pbs.twimg.com/profile_images/2010692334107684864/dQBcFxyj_400x400.jpg" alt="Member 2" />
        <div class="ciderjams-session-member-info">
          <p class="ciderjams-session-member-name">breyy</p>
          <p class="ciderjams-session-member-username">@pouler</p>
        </div>
      </div>
      <div class="ciderjams-session-member">
        <img src="https://cdn.discordapp.com/avatars/750770863418376216/f20db21adc47f1c0d92bba4042ae8aef.webp?size=240" alt="Member 3" />
        <div class="ciderjams-session-member-info">
          <p class="ciderjams-session-member-name">Hortense</p>
          <p class="ciderjams-session-member-username">@hotrans</p>
        </div>
      </div>
    </div>

    <hr class="ciderjams-divider" />

    <div class="ciderjams-buttons">
      <button class="c-btn primary" @click="leaveSession">
        Leave session
      </button>

      <div class="ciderjams-icon-buttons">  
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

.ciderjams-icon-button {
  background: none !important;
  border: none !important;
  box-shadow: none !important;
  cursor: pointer;
  display: flex;
  padding: 0.25rem;
}
</style>
