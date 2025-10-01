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
import { devtools } from "@vue/devtools";
import { createPinia } from "pinia";
import { type App, defineCustomElement } from "vue";
import ComponentBasedModal from "./components/ComponentBasedModal.vue";
import HelloWorld from "./components/HelloWorld.vue";
import MenuIndicator from "./components/MenuIndicator.vue";
import ModalExample from "./components/ModalExample.vue";
import MySettings from "./components/MySettings.vue";
import ComponentsShowcase from "./pages/ComponentsShowcase.vue";
import CustomPage from "./pages/CustomPage.vue";
import PluginConfig from "./plugin.config";

if (import.meta.env.VITE_WITH_VUE_DEVTOOLS === "true") {
  console.log("Connecting to vue devtools");
  devtools.connect("localhost", 8098);
}

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
  "menu-indicator": defineCustomElement(MenuIndicator, {
    shadowRoot: false,
    configureApp,
  }),
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
 * Menu item injector from addCustomButton API
 */
const createMenuItemIndicator = () => {
  const menuItems = window.document.body.querySelectorAll(
    `[sfc-name="PluginBaseButton"] > div.chrome-button-content`
  );
  // Find menu item with `${plugin.identifier}-chrome-top-right-icon`
  const menuItem = Array.from(menuItems).find(
    (item) => item.textContent === `${plugin.identifier}-chrome-top-right-icon`
  );
  console.log("menuItems", menuItems);
  if (menuItem) {
    const indicator = document.createElement(
      customElementName("menu-indicator")
    );
    indicator.id = `${plugin.identifier}-chrome-top-right-icon-indicator`;

    // Remove content of menuItem
    menuItem.innerHTML = "";
    menuItem.appendChild(indicator);

    return true; // Indicate that the element was found and indicator created
  }
  return false; // Indicate that the element was not found
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
        element: `${plugin.identifier}-chrome-top-right-icon`,
        location: "chrome-top/right",
        title: "Cider Jams",
        ctxMenuElement: customElementName("hello-world"),
        menuElement: customElementName("hello-world"),
      });
      // Wait for the menu custom button to be created
      // then inject our custom vue component
      if (!createMenuItemIndicator()) {
        const observer = new MutationObserver((_mutations, obs) => {
          if (createMenuItemIndicator()) {
            obs.disconnect(); // Disconnect once the element is found and indicator created
          }
        });

        const appToolbar = window.document.body.querySelector(
          `[sfc-name="QToolbar"]`
        );
        if (appToolbar) {
          // Start observing the body for childList changes
          observer.observe(appToolbar, {
            childList: true,
            subtree: true,
          });
        }
      }

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
