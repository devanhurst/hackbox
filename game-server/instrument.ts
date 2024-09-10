import * as Sentry from "@sentry/node";

import { nodeProfilingIntegration } from "@sentry/profiling-node";
import { SocketIoInstrumentation } from "@opentelemetry/instrumentation-socket.io";

Sentry.init({
  enabled: process.env.SENTRY_ENABLED === "true",
  dsn: "https://a0c7c6d8804afc55ec47eb18acd028f7@o4507848851652608.ingest.us.sentry.io/4507848855388160",
  integrations: [
    nodeProfilingIntegration(),
    Sentry.captureConsoleIntegration(),
  ],
  tracesSampleRate:
    parseFloat(process.env.SENTRY_TRACE_SAMPLE_RATE as string) || 0,
  profilesSampleRate:
    parseFloat(process.env.SENTRY_PROFILE_SAMPLE_RATE as string) || 0,
});

Sentry.addOpenTelemetryInstrumentation(new SocketIoInstrumentation());
