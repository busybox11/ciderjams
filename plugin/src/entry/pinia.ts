import { createPinia, setActivePinia } from "pinia";
import type { App } from "vue";

export const pinia = createPinia();
setActivePinia(pinia);

export function configureApp(app: App) {
  app.use(pinia);
}
