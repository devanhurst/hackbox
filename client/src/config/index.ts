export default {
  clientUrl: import.meta.env.VITE_CLIENT_URL || "http://localhost:9001",
  serverUrl: import.meta.env.VITE_SERVER_URL || "http://localhost:9000",
  partyHost: import.meta.env.VITE_PARTY_HOST || "http://localhost:8787",
  sentryEnabled: import.meta.env.VITE_SENTRY_ENABLED === "true",
  sentryDomain: import.meta.env.VITE_SENTRY_DOMAIN,
  sentryProjectId: import.meta.env.VITE_SENTRY_PROJECT_ID,
  sentryTraceSampleRate: parseFloat(import.meta.env.VITE_SENTRY_TRACE_SAMPLE_RATE) || 0,
  sentrySessionReplaySampleRate:
    parseFloat(import.meta.env.VITE_SENTRY_SESSION_REPLAY_SAMPLE_RATE) || 0,
  sentryErrorReplaySampleRate:
    parseFloat(import.meta.env.VITE_SENTRY_ERROR_REPLAY_SAMPLE_RATE) || 0,
  twitchClientId: import.meta.env.VITE_TWITCH_CLIENT_ID,
};
