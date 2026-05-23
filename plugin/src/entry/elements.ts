import { defineCustomElement } from "vue";

import { configureApp } from "./pinia";
import MainModalView from "../ui/modal/MainModalView.vue";
import MenuIndicator from "../ui/modal/MenuIndicator.vue";

export const CustomElements = {
  "menu-indicator": defineCustomElement(MenuIndicator, {
    shadowRoot: false,
    configureApp,
  }),
  "main-modal-view": defineCustomElement(MainModalView, {
    shadowRoot: false,
    configureApp,
  }),
};
