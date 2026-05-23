import { createPinia, setActivePinia } from "pinia";
import { type App, defineCustomElement } from "vue";

import { devtools } from "@vue/devtools";

import {
  addCustomButton,
  definePluginContext,
  subscribeEvent,
  useCider,
  useMusicKit,
} from "@ciderapp/pluginkit";

import JamToastHost from "./components/JamToastHost.vue";
import MainModalView from "./components/MainModal/MainModalView.vue";
import MenuIndicator from "./components/MainModal/MenuIndicator.vue";
import MySettings from "./components/MySettings.vue";
import QueueItemUser from "./components/QueueItemUser.vue";
import { InternalPluginSubscribeEvents, internalPluginEvents } from "./lib/events";
import { mountInto, registerInjector, setupInjection } from "./lib/injection";
import { log } from "./lib/logger";
import ComponentsShowcase from "./pages/ComponentsShowcase.vue";
import CustomPage from "./pages/CustomPage.vue";
import PluginConfig from "./plugin.config";
import { useSharePlayStore } from "./stores/shareplay";

if (import.meta.env.VITE_WITH_VUE_DEVTOOLS === "true") {
  log.log("Connecting to vue devtools");
  devtools.connect("localhost", 8098);
}

const PLUGIN_CONSTANTS = {
  MENU_BTN_INJECTOR_ID: `cider-jams-menu-btn-injector`,
};

/**
 * Initializing a Vue app instance so we can use things like Pinia.
 */
const pinia = createPinia();
setActivePinia(pinia);

/**
 * Function that configures the app instances of the custom elements
 */
function configureApp(app: App) {
  app.use(pinia);
}

const MENU_BTN_INJECT_KEY = Symbol.for("ciderjams.menu-btn");
const QUEUE_ITEM_INJECT_KEY = Symbol.for("ciderjams.am-queue-item");

registerInjector({
  // @ts-expect-error: PluginBaseButton is an untyped global definition
  target: window.__PLUGINSYS__.App.Components.PluginBaseButton,
  key: MENU_BTN_INJECT_KEY,

  match: (component) =>
    component.$?.props?.button?.element === PLUGIN_CONSTANTS.MENU_BTN_INJECTOR_ID,

  inject(component, el) {
    const host = (component.$?.vnode?.el ?? el) as HTMLElement | undefined;
    if (!host) return false;
    for (const child of Array.from(host.children) as HTMLElement[]) {
      child.style.display = "none";
    }
    host.appendChild(document.createElement(customElementName("menu-indicator")));
    return true;
  },
});

registerInjector({
  key: QUEUE_ITEM_INJECT_KEY,
  match: (component, el) =>
    component.$?.type?.__name === "AMQueueItem" &&
    !!el.querySelector(".queue-item-actions") &&
    el.children.length > 0,

  inject(component, el) {
    const amMediaItem = component.$?.props?.item;
    if (!amMediaItem) return false;

    el.style.gridTemplateColumns = "48px 1fr auto auto";
    mountInto(QueueItemUser, el, window.CiderApp.app._context, {
      item: amMediaItem,
    });
    return true;
  },
});

/**
 * Custom Elements that will be registered in the app
 */
export const CustomElements = {
  "menu-indicator": defineCustomElement(MenuIndicator, {
    shadowRoot: false,
    configureApp,
  }),
  "main-modal-view": defineCustomElement(MainModalView, {
    shadowRoot: false,
    configureApp,
  }),
  "page-helloworld": defineCustomElement(CustomPage, {
    shadowRoot: false,
    configureApp,
  }),
  "page-components": defineCustomElement(ComponentsShowcase, {
    shadowRoot: false,
    configureApp,
  }),
};

/**
 * Defining the plugin context
 */
const { plugin, setupConfig, customElementName, goToPage, useCPlugin } = definePluginContext({
  ...PluginConfig,
  CustomElements,
  setup() {
    /**
     * Registering the custom elements in the app
     */
    for (const [key, value] of Object.entries(CustomElements)) {
      const _key = key as keyof typeof CustomElements;
      customElements.define(customElementName(_key), value);
    }

    // Explicitly defining our settings element here to avoid issues with module load order
    customElements.define(
      customElementName("settings"),
      defineCustomElement(MySettings, {
        shadowRoot: false,
        configureApp,
      }),
    );

    /**
     * Defining our custom settings element
     */
    this.SettingsElement = customElementName("settings");

    setupInjection(window.CiderApp.app);

    addCustomButton({
      element: PLUGIN_CONSTANTS.MENU_BTN_INJECTOR_ID,
      location: "chrome-top/right",
      title: "Cider Jams",
      ctxMenuElement: customElementName("main-modal-view"),
      menuElement: customElementName("main-modal-view"),
    });

    const cider = useCider();
    log.log("Cider", cider);

    let lastQueueHash: string | null = null;
    const mkStore = cider.musicKitStore;
    mkStore.$subscribe((_m: any, state: any) => {
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
    (window as unknown as { spi: typeof sharePlayStore }).spi = sharePlayStore;

    subscribeEvent("browser:page_changed", (data) => {
      log.log("internal event", data);
    });

    musickit.addEventListener("nowPlayingItemWillChange", ({ item }: { item: any }) => {
      log.log("Now playing item will change", item);
    });
    musickit.addEventListener("nowPlayingItemDidChange", ({ item }: { item: any }) => {
      log.log("Now playing item", item);
    });
  },
});

/**
 * Some boilerplate code for our own configuration
 */
export const cfg = setupConfig({
  favoriteColor: <"red" | "green" | "blue">"blue",
  count: <number>0,
  booleanOption: <boolean>false,
});

export function useConfig() {
  return cfg.value;
}

/**
 * Exporting the plugin and functions
 */
export { customElementName, goToPage, setupConfig, useCPlugin };

/**
 * Exporting the plugin, Cider will use this to load the plugin
 */
export default plugin;
