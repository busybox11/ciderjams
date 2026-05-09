import { defineStore } from "pinia";
import { ref, shallowRef } from "vue";

import { SharePlayInhibitor, type SharePlayParticipant } from "../shareplay";

export const useSharePlayStore = defineStore("shareplay", () => {
  const active = ref(false);
  const participants = ref<SharePlayParticipant[]>([]);

  /** last payload published to MusicKit after a successful `syncFromServer` */
  const lastMediaPayload = ref<unknown>(null);
  const inhibitor = shallowRef<SharePlayInhibitor | null>(null);

  function activate() {
    if (inhibitor.value) return;

    const inst = new SharePlayInhibitor({
      onInjected: (p) => {
        active.value = true;
        participants.value = p;
      },
      onEjected: () => {
        active.value = false;
        participants.value = [];
        lastMediaPayload.value = null;
      },
      onMediaStatePublished: (payload) => {
        lastMediaPayload.value = payload;
      },
    });
    if (inst.inject()) {
      inhibitor.value = inst;
    }
  }

  function deactivate() {
    inhibitor.value?.eject();
    inhibitor.value = null;
  }

  function syncFromServer(serverData: unknown) {
    return inhibitor.value?.syncFromServer(serverData);
  }

  function triggerMockSync() {
    inhibitor.value?.triggerMockSync();
  }

  return {
    active,
    participants,
    lastMediaPayload,
    inhibitor,
    activate,
    deactivate,
    syncFromServer,
    triggerMockSync,
  };
});
