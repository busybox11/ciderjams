import {
  addCustomButton,
  definePluginContext,
  subscribeEvent,
  useCider,
  useMusicKit,
} from "@ciderapp/pluginkit";
import { devtools } from "@vue/devtools";
import { createPinia } from "pinia";
import { type App, defineCustomElement } from "vue";

import MainModalView from "./components/MainModal/MainModalView.vue";
import MenuIndicator from "./components/MainModal/MenuIndicator.vue";

import MySettings from "./components/MySettings.vue";
import QueueItemUser from "./components/QueueItemUser.vue";
import { mountInto, registerInjector, setupInjection } from "./lib/injection";
import ComponentsShowcase from "./pages/ComponentsShowcase.vue";
import CustomPage from "./pages/CustomPage.vue";

import PluginConfig from "./plugin.config";

if (import.meta.env.VITE_WITH_VUE_DEVTOOLS === "true") {
  console.log("Connecting to vue devtools");
  devtools.connect("localhost", 8098);
}

const PLUGIN_CONSTANTS = {
  MENU_BTN_INJECTOR_ID: `cider-jams-menu-btn-injector`,
};

/**
 * Initializing a Vue app instance so we can use things like Pinia.
 */
const pinia = createPinia();

/**
 * Function that configures the app instances of the custom elements
 */
function configureApp(app: App) {
  app.use(pinia);
}

setupInjection(window.CiderApp.app);

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

registerInjector({
  // @ts-ignore: PluginBaseButton is an untyped global definition
  target: window.__PLUGINSYS__.App.Components.PluginBaseButton,

  match: (component) =>
    component.$?.props?.button?.element ===
    PLUGIN_CONSTANTS.MENU_BTN_INJECTOR_ID,

  inject(component) {
    const host: HTMLElement = component.$?.vnode?.el;
    for (const child of Array.from(host.children) as HTMLElement[]) {
      child.style.display = "none";
    }
    host.appendChild(
      document.createElement(customElementName("menu-indicator")),
    );
    host.style.marginRight = "1rem";
  },
});

registerInjector({
  match: (component, el) =>
    component.$?.type?.__name === "AMQueueItem" &&
    !!el.querySelector(".queue-item-actions") &&
    el.children.length > 0,

  inject(_component, el) {
    el.style.gridTemplateColumns = "48px 1fr auto auto";
    mountInto(QueueItemUser, el);
  },
});

/**
 * Defining the plugin context
 */
const { plugin, setupConfig, customElementName, goToPage, useCPlugin } =
  definePluginContext({
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

      addCustomButton({
        element: PLUGIN_CONSTANTS.MENU_BTN_INJECTOR_ID,
        location: "chrome-top/right",
        title: "Cider Jams",
        ctxMenuElement: customElementName("main-modal-view"),
        menuElement: customElementName("main-modal-view"),
      });

      const cider = useCider();
      console.log("Cider", cider);

      const musickit = useMusicKit();
      console.log("MusicKit", musickit);

      subscribeEvent("browser:page_changed", (data) => {
        console.log("internal event", data);
      });

      musickit.addEventListener(
        "nowPlayingItemWillChange",
        ({ item }: { item: any }) => {
          console.log("Now playing item will change", item);
        },
      );
      musickit.addEventListener(
        "nowPlayingItemDidChange",
        ({ item }: { item: any }) => {
          console.log("Now playing item", item);
        },
      );
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
