import { defineCustomElement } from "vue";

import MainModalView from "../ui/modal/MainModalView.vue";
import MenuIndicator from "../ui/modal/MenuIndicator.vue";
import { configureApp } from "./pinia";

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
