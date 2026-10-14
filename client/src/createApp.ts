import { createSSRApp } from "vue";
import type { RouterHistory } from "vue-router";
import App from "./App.vue";
import { createAppRouter } from "./router";
import components from "@/components";

import { library } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { faPaperPlane, faCheck } from "@fortawesome/free-solid-svg-icons";
import { faTwitch } from "@fortawesome/free-brands-svg-icons";

library.add(faPaperPlane, faCheck, faTwitch);

export function createHackboxApp(history: RouterHistory) {
  const app = createSSRApp(App);
  const router = createAppRouter(history);

  app.use(router);

  Object.entries(components).map(([name, component]) => {
    app.component(name, component);
  });

  app.component("font-awesome-icon", FontAwesomeIcon);

  return { app, router };
}
