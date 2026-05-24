import { defineStore } from "pinia";
import { type Ref, ref, type ShallowRef, shallowRef } from "vue";

import { createLogger, type RoomStateSchema } from "@ciderjams/proto";

import {
  SharePlayInhibitor,
  type SharePlayPublishedMediaState,
  type SharePlaySyncInput,
} from "../shareplay/guest/inhibitor";

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
  updateRoom: (room: RoomStateSchema) => void;
  triggerMockSync: () => void;
}

export const useSharePlayStore = defineStore("shareplay", (): SharePlayStore => {
  const active = ref(false);

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

  function updateRoom(room: RoomStateSchema) {
    inhibitor.value?.updateRoom(room);
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
    updateRoom,
    triggerMockSync,
  };
});
