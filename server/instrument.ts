import * as Sentry from "@sentry/node";

import { nodeProfilingIntegration } from "@sentry/profiling-node";

if (process.env.SENTRY_ENABLED === "true") {
  Sentry.init({
    dsn: `${process.env.SENTRY_DOMAIN}/${process.env.SENTRY_PROJECT_ID}`,
    integrations: [
      nodeProfilingIntegration(),
      Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] }),
    ],
    enableLogs: true,
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACE_SAMPLE_RATE as string) || 0,
    profilesSampleRate: parseFloat(process.env.SENTRY_PROFILE_SAMPLE_RATE as string) || 0,
  });
}
