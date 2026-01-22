export default {
  port: import.meta.env.VITE_PORT,
  backendUri: import.meta.env.VITE_BACKEND_URI,
  playerClientUri: import.meta.env.VITE_PLAYER_CLIENT_URI,
  sentryEnabled: import.meta.env.VITE_SENTRY_ENABLED === "true",
  sentryTraceSampleRate: parseFloat(import.meta.env.VITE_SENTRY_TRACE_SAMPLE_RATE) || 0,
  sentrySessionReplaySampleRate:
    parseFloat(import.meta.env.VITE_SENTRY_SESSION_REPLAY_SAMPLE_RATE) || 0,
  sentryErrorReplaySampleRate:
    parseFloat(import.meta.env.VITE_SENTRY_ERROR_REPLAY_SAMPLE_RATE) || 0,
};
