import { defineStore } from "pinia";
import { type Ref, ref, type ShallowRef, shallowRef } from "vue";

import { createLogger } from "@ciderjams/proto";

import {
  SharePlayInhibitor,
  type SharePlayPublishedMediaState,
  type SharePlaySyncInput,
} from "./inhibitor";

const log = createLogger("plugin", "playback/store");

export interface SharePlayStore {
  active: Ref<boolean>;
  lastMediaPayload: Ref<SharePlayPublishedMediaState | null>;
  inhibitor: ShallowRef<SharePlayInhibitor | null>;
  activate: () => void;
  deactivate: () => void;
  syncFromServer: (
    serverData: SharePlaySyncInput,
  ) => ReturnType<SharePlayInhibitor["syncFromServer"]> | undefined;
  bumpGuestActionSuppress: (durationMs?: number) => void;
  triggerMockSync: () => void;
}

export const useSharePlayStore = defineStore("shareplay", (): SharePlayStore => {
  const active = ref(false);

  /** last payload published to MusicKit after a successful `syncFromServer` */
  const lastMediaPayload = ref<SharePlayPublishedMediaState | null>(null);
  const inhibitor = shallowRef<SharePlayInhibitor | null>(null);

  function activate() {
    if (inhibitor.value) return;

    const inst = new SharePlayInhibitor({
      onInjected: () => {
        active.value = true;
      },
      onEjected: () => {
        active.value = false;
        lastMediaPayload.value = null;
      },
      onMediaStatePublished: (payload) => {
        log.debug("onMediaStatePublished", payload);
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

  function syncFromServer(serverData: SharePlaySyncInput) {
    return inhibitor.value?.syncFromServer(serverData);
  }

  function bumpGuestActionSuppress(durationMs?: number) {
    inhibitor.value?.bumpGuestActionSuppress(durationMs);
  }

  function triggerMockSync() {
    inhibitor.value?.triggerMockSync();
  }

  return {
    active,
    lastMediaPayload,
    inhibitor,
    activate,
    deactivate,
    syncFromServer,
    bumpGuestActionSuppress,
    triggerMockSync,
  };
});
