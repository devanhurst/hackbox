import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import components from "@/components";
import * as Sentry from "@sentry/vue";
import config from "@/config";

import { library } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { faPaperPlane, faCheck } from "@fortawesome/free-solid-svg-icons";
import { faTwitch } from "@fortawesome/free-brands-svg-icons";

library.add(faPaperPlane, faCheck, faTwitch);

const app = createApp(App);

Sentry.init({
  app,
  enabled: config.sentryEnabled,
  dsn: "https://c461bfb8904ecb4c0a266b1751087809@o4507848851652608.ingest.us.sentry.io/4507861181792256",
  integrations: [
    Sentry.browserTracingIntegration({ router }),
    Sentry.replayIntegration({ maskAllText: false, blockAllMedia: false }),
  ],
  tracePropagationTargets: ["localhost", /^https:\/\/app\.hackbox\.ca/],
  tracesSampleRate: config.sentryTraceSampleRate,
  replaysSessionSampleRate: config.sentrySessionReplaySampleRate,
  replaysOnErrorSampleRate: config.sentryErrorReplaySampleRate,
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
