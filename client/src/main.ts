import { createWebHistory } from "vue-router";
import * as Sentry from "@sentry/vue";
import config from "@/config";
import { createHackboxApp } from "./createApp";

const { app, router } = createHackboxApp(createWebHistory(import.meta.env.BASE_URL));

if (config.sentryEnabled) {
  Sentry.init({
    app,
    dsn: `${config.sentryDomain}/${config.sentryProjectId}`,
    integrations: [
      Sentry.browserTracingIntegration({ router }),
      Sentry.replayIntegration({ maskAllText: false, blockAllMedia: false }),
    ],
    tracePropagationTargets: ["localhost", /^https:\/\/app\.hackbox\.ca/],
    tracesSampleRate: config.sentryTraceSampleRate,
    replaysSessionSampleRate: config.sentrySessionReplaySampleRate,
    replaysOnErrorSampleRate: config.sentryErrorReplaySampleRate,
  });
}

// This shouldn't be used until it works for all devices.
// On iOS, the keyboard does not appear until the user
// interacts with page.
app.directive("focus", {
  mounted(el) {
    el.focus();
    el.setSelectionRange(0, 0);
  },
});

// Only the lobby is prerendered; every other path is served the empty shell,
// which has nothing to hydrate.
void router.isReady().then(() => app.mount("#app"));
