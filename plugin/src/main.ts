import { devtools } from "@vue/devtools";

import { definePluginContext } from "@ciderapp/pluginkit";

import { log } from "./cider/logger";
import { installPluginConfig } from "./entry/config";
import { CustomElements } from "./entry/elements";
import { registerPluginInjectors } from "./entry/injectors";
import { runPluginSetup } from "./entry/plugin-setup";
import PluginConfig from "./plugin.config";

if (import.meta.env.VITE_WITH_VUE_DEVTOOLS === "true") {
  log.log("Connecting to vue devtools");
  devtools.connect("localhost", 8098);
}

export { CustomElements } from "./entry/elements";

const { plugin, setupConfig, customElementName, goToPage, useCPlugin } = definePluginContext({
  ...PluginConfig,
  CustomElements,
  setup() {
    runPluginSetup(customElementName, CustomElements, this);
  },
});

registerPluginInjectors(customElementName);

installPluginConfig(setupConfig);

export { useConfig } from "./entry/config";

export { customElementName, goToPage, setupConfig, useCPlugin };

export default plugin;
