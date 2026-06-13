export default {
  clientUrl: import.meta.env.VITE_CLIENT_URL || "http://localhost:9001",
  // HTTP API (the hackbox-api Worker), served under the apex /api prefix in
  // production (e.g. "https://hackbox.ca/api"). Room creation + existence checks.
  apiUrl: import.meta.env.VITE_API_URL || "http://localhost:8787/api",
  // Realtime relay host for the WebSocket connection (the hackbox-relay Worker).
  // Host[:port] only — no protocol or path; the SDK adds the "/relay" prefix and
  // partysocket infers ws/wss. In production this is the apex (e.g. "hackbox.ca").
  relayHost: import.meta.env.VITE_RELAY_HOST || "localhost:1999",
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
