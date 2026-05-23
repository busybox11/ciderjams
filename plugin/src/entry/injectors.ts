import { mountInto, registerInjector } from "../cider/injection";
import QueueItemUser from "../ui/QueueItemUser.vue";

const MENU_BTN_INJECTOR_ID = "cider-jams-menu-btn-injector";
const MENU_BTN_INJECT_KEY = Symbol.for("ciderjams.menu-btn");
const QUEUE_ITEM_INJECT_KEY = Symbol.for("ciderjams.am-queue-item");

export { MENU_BTN_INJECTOR_ID };

export function registerPluginInjectors(customElementName: (name: string) => string) {
  registerInjector({
    // @ts-expect-error: PluginBaseButton is an untyped global definition
    target: window.__PLUGINSYS__.App.Components.PluginBaseButton,
    key: MENU_BTN_INJECT_KEY,

    match: (component) => component.$?.props?.button?.element === MENU_BTN_INJECTOR_ID,

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
}
