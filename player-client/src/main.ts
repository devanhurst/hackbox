import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import components from "@/components";
import * as Sentry from "@sentry/vue";

import { library } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { faPaperPlane, faCheck } from "@fortawesome/free-solid-svg-icons";
import { faTwitch } from "@fortawesome/free-brands-svg-icons";

library.add(faPaperPlane, faCheck, faTwitch);

const app = createApp(App);

Sentry.init({
  app,
  dsn: "https://5bc56324afa78ccaafb83f1ad75bb800@o4507848851652608.ingest.us.sentry.io/4507848855388160",
  integrations: [
    Sentry.browserTracingIntegration({ router }),
    Sentry.replayIntegration(),
  ],
  tracesSampleRate: 1.0,
  tracePropagationTargets: ["localhost", /^https:\/\/app\.hackbox\.ca/],
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});

app.use(router);

Object.entries(components).map(([name, component]) => {
  app.component(name, component);
});

app.component("font-awesome-icon", FontAwesomeIcon);

// This shouldn't be used until it works for all devices.
// On iOS, the keyboard does not appear until the user
// interacts with page.
app.directive("focus", {
  mounted(el) {
    el.focus();
    el.setSelectionRange(0, 0);
  },
});

app.mount("#app");
