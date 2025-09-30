import {
  addCustomButton,
  addImmersiveMenuEntry,
  addMainMenuEntry,
  addMediaItemContextMenuEntry,
  createModal,
  definePluginContext,
  subscribeEvent,
  useCider,
  useMusicKit,
} from "@ciderapp/pluginkit";
import { createPinia } from "pinia";
import type { App } from "vue";
import { defineCustomElement } from "vue";
import ComponentBasedModal from "./components/ComponentBasedModal.vue";
import HelloWorld from "./components/HelloWorld.vue";
import ModalExample from "./components/ModalExample.vue";
import MySettings from "./components/MySettings.vue";
import ComponentsShowcase from "./pages/ComponentsShowcase.vue";
import CustomPage from "./pages/CustomPage.vue";
import PluginConfig from "./plugin.config";

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

/**
 * Custom Elements that will be registered in the app
 */
export const CustomElements = {
  "hello-world": defineCustomElement(HelloWorld, {
    /**
     * Disabling the shadow root DOM so that we can inject styles from the DOM
     */
    shadowRoot: false,
    configureApp,
  }),
  "modal-example": defineCustomElement(ModalExample, {
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
  "component-based-modal": defineCustomElement(ComponentBasedModal, {
    shadowRoot: false,
    configureApp,
  }),
};

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
        })
      );

      /**
       * Defining our custom settings element
       */
      this.SettingsElement = customElementName("settings");

      // Here we add a new entry to the main menu
      addMainMenuEntry({
        label: "Go to my page",
        onClick() {
          goToPage({
            name: "page-helloworld",
          });
        },
      });

      addMainMenuEntry({
        label: "Modal example",
        onClick() {
          const { closeDialog, openDialog, dialogElement } = createModal({
            escClose: true,
          });
          const content = document.createElement(
            customElementName("modal-example")
          );
          // @ts-ignore
          content._props.closeFn = closeDialog;
          dialogElement.appendChild(content);
          openDialog();
        },
      });

      addImmersiveMenuEntry({
        label: "Go to my page",
        onClick() {
          goToPage({
            name: "page-helloworld",
          });
        },
      });

      addMainMenuEntry({
        label: "Go to Components Showcase",
        onClick() {
          goToPage({
            name: "page-components",
          });
        },
      });

      // Here we add a custom button to the top right of the chrome
      addCustomButton({
        element: "♥",
        location: "chrome-top/right",
        title: "Cider Jams",
        menuElement: customElementName("hello-world"),
      });

      addMediaItemContextMenuEntry({
        label: "Send to plugin",
        onClick(item) {
          console.log("Got this item", item);
        },
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
        ({ item }: { item: MusicKit.MediaItem }) => {
          console.log("Now playing item will change", item);
        }
      );
      musickit.addEventListener(
        "nowPlayingItemDidChange",
        ({ item }: { item: MusicKit.MediaItem }) => {
          console.log("Now playing item", item);
        }
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
