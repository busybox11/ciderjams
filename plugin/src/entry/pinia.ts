import type { App } from "vue";

import { createPinia, setActivePinia } from "pinia";

export const pinia = createPinia();
setActivePinia(pinia);

export function configureApp(app: App) {
  app.use(pinia);
}
