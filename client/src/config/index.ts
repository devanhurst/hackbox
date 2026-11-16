import { siblingPreviewHost } from "@/lib/previewHosts";

// In production the api and relay Workers are co-located with the client on the
// same origin (hackbox.ca/api, hackbox.ca/r/*), so default to the current origin
// rather than localhost. This means a prod build works even if the VITE_* vars
// aren't set at build time (a missing VITE_API_URL previously baked a localhost
// URL into the bundle, which the browser blocked as mixed content). The VITE_*
// values still win when provided (e.g. to point at a different host).
const isDev = import.meta.env.DEV;
// The lobby is prerendered in Node at build time, where there is no window;
// nothing rendered there may depend on these origin-derived values.
const location = typeof window === "undefined" ? undefined : window.location;

// A Preview of the client is served on workers.dev, which has no /api or /r
// routes of its own. A branch Preview talks to the same branch's api and relay
// Previews; a deployment URL has no branch to match, so it uses production.
function previewHost(worker: string): string | undefined {
  if (!location?.hostname.endsWith(".workers.dev")) return undefined;
  return siblingPreviewHost(location.hostname, "hackbox-client", worker) ?? "hackbox.ca";
}
const previewApiHost = previewHost("hackbox-api");
const previewRelayHost = previewHost("hackbox-relay");

export default {
  clientUrl:
    import.meta.env.VITE_CLIENT_URL || (isDev ? "http://localhost:9001" : location?.origin),
  apiUrl:
    import.meta.env.VITE_API_URL ||
    (isDev
      ? "http://localhost:8787/api"
      : `${previewApiHost ? `https://${previewApiHost}` : location?.origin}/api`),
  // Host[:port] only — no protocol or path; the SDK adds the "/r" prefix and
  // partysocket infers ws/wss.
  relayHost:
    import.meta.env.VITE_RELAY_HOST ||
    (isDev ? "localhost:1999" : previewRelayHost || location?.host),
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
