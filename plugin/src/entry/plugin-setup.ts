import { defineCustomElement } from "vue";

import {
  addCustomButton,
  subscribeEvent,
  useCider,
  useMusicKit,
} from "@ciderapp/pluginkit";

import { internalPluginEvents, InternalPluginSubscribeEvents } from "../cider/events";
import { mountInto, setupInjection } from "../cider/injection";
import { log } from "../lib/logger";
import { useSharePlayStore } from "../playback/store";
import JamToastHost from "../ui/JamToastHost.vue";
import MySettings from "../ui/MySettings.vue";
import type { CustomElements } from "./elements";
import { MENU_BTN_INJECTOR_ID } from "./injectors";
import { configureApp } from "./pinia";

export function runPluginSetup(
  customElementName: (name: string) => string,
  elements: typeof CustomElements,
  pluginInstance: { SettingsElement?: string },
) {
  for (const key of Object.keys(elements) as (keyof typeof CustomElements)[]) {
    window.customElements.define(customElementName(key), elements[key]);
  }

  window.customElements.define(
    customElementName("settings"),
    defineCustomElement(MySettings, {
      shadowRoot: false,
      configureApp,
    }),
  );

  pluginInstance.SettingsElement = customElementName("settings");

  setupInjection(window.CiderApp.app);

  addCustomButton({
    element: MENU_BTN_INJECTOR_ID,
    location: "chrome-top/right",
    title: "Cider Jams",
    ctxMenuElement: customElementName("main-modal-view"),
    menuElement: customElementName("main-modal-view"),
  });

  const cider = useCider();
  log.log("Cider", cider);

  let lastQueueHash: string | null = null;
  const mkStore = cider.musicKitStore;
  mkStore.$subscribe((_m: unknown, state: { queueHash: string }) => {
    const newQueueHash = state.queueHash;
    if (newQueueHash !== lastQueueHash) {
      lastQueueHash = newQueueHash;
      log.log("queueHash changed", newQueueHash);
      internalPluginEvents.dispatchEvent(
        new Event(InternalPluginSubscribeEvents.QUEUE_HASH_DID_CHANGE),
      );
    }
  });

  const musickit = useMusicKit();
  log.log("MusicKit", musickit);

  const toastHost = document.createElement("div");
  toastHost.id = "ciderjams-toast-root";
  document.body.appendChild(toastHost);
  mountInto(JamToastHost, toastHost);

  const sharePlayStore = useSharePlayStore();
  log.log("SharePlay store", sharePlayStore);
  if (import.meta.env.DEV) {
    (window as unknown as { spi: typeof sharePlayStore }).spi = sharePlayStore;
  }

  subscribeEvent("browser:page_changed", (data) => {
    log.log("internal event", data);
  });

  musickit.addEventListener("nowPlayingItemWillChange", ({ item }: { item: unknown }) => {
    log.log("Now playing item will change", item);
  });
  musickit.addEventListener("nowPlayingItemDidChange", ({ item }: { item: unknown }) => {
    log.log("Now playing item", item);
  });
}
