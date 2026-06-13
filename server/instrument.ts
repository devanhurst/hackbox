import * as Sentry from "@sentry/node";

import { nodeProfilingIntegration } from "@sentry/profiling-node";

if (process.env.SENTRY_ENABLED === "true") {
  Sentry.init({
    dsn: `${process.env.SENTRY_DOMAIN}/${process.env.SENTRY_PROJECT_ID}`,
    integrations: [
      nodeProfilingIntegration(),
      Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] }),
    ],
    // The default stack parser calls `decodeURI(filename)` unguarded
    // (@sentry/core node-stack-trace.js), which throws `URIError: URI malformed`
    // on any frame whose filename contains a bare "%". Because that throw happens
    // inside the SDK's own error-reporting path, it escapes as a fresh uncaught
    // exception and takes the whole process down. Wrap it so reporting can never
    // crash the service.
    stackParser: (stack, skipFirstLines, framesToPop) => {
      try {
        return Sentry.defaultStackParser(stack, skipFirstLines, framesToPop);
      } catch (err) {
        // Don't crash the reporter — but surface the raw stack so the
        // underlying error (which currently only manifests as SERVER-3QX,
        // never as its own issue) becomes diagnosable in logs.
        console.error("Sentry stackParser failed; raw stack was:\n", stack, "\n", err);
        return [];
      }
    },
    enableLogs: true,
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACE_SAMPLE_RATE as string) || 0,
    profilesSampleRate: parseFloat(process.env.SENTRY_PROFILE_SAMPLE_RATE as string) || 0,
  });
}
