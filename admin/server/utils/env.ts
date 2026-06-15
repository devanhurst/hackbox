import type { D1Database } from "@cloudflare/workers-types";
import type { H3Event } from "h3";

// Minimal relay service-binding shape. We deliberately don't use the
// `@cloudflare/workers-types` `Fetcher` here: its `fetch` signature pulls in the
// Workers-specific `Request`/`Response` types, which clash with the standard
// global ones used everywhere else in the Nitro server runtime.
export interface RelayFetcher {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
}

// Cloudflare bindings declared in wrangler.toml, surfaced on the H3 event by the
// Nitro `cloudflare_module` preset (and by `nitro-cloudflare-dev` in dev).
export interface AdminEnv {
  RELAY: RelayFetcher; // service binding to hackbox-relay
  DB: D1Database; // permanent room history (shared with the relay)
}

export function getEnv(event: H3Event): AdminEnv {
  const env = event.context.cloudflare?.env as unknown as AdminEnv | undefined;
  if (!env?.DB || !env?.RELAY) {
    throw createError({
      statusCode: 500,
      statusMessage: "Cloudflare bindings (DB, RELAY) are unavailable",
    });
  }
  return env;
}
