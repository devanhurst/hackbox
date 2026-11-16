import type { D1Database } from "@cloudflare/workers-types";
import type { H3Event } from "h3";
import { previewRelay } from "./previewRelay";

// Minimal relay service-binding shape. We deliberately don't use the
// `@cloudflare/workers-types` `Fetcher` here: its `fetch` signature pulls in the
// Workers-specific `Request`/`Response` types, which clash with the standard
// global ones used everywhere else in the Nitro server runtime.
export interface RelayFetcher {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
}

export interface AdminEnv {
  RELAY: RelayFetcher;
  DB: D1Database;
}

interface WorkerEnv extends Partial<AdminEnv> {
  ENVIRONMENT?: string;
  ADMIN_SECRET?: string;
}

export function getEnv(event: H3Event): AdminEnv {
  const env = event.context.cloudflare?.env as unknown as WorkerEnv | undefined;
  if (env?.ENVIRONMENT === "preview") {
    const relay = env.ADMIN_SECRET && previewRelay(getRequestURL(event).hostname, env.ADMIN_SECRET);
    if (!env.DB || !relay) {
      throw createError({
        statusCode: 500,
        statusMessage: "Preview needs DB, ADMIN_SECRET, and a branch preview host",
      });
    }
    return { DB: env.DB, RELAY: relay };
  }
  if (!env?.DB || !env?.RELAY) {
    throw createError({
      statusCode: 500,
      statusMessage: "Cloudflare bindings (DB, RELAY) are unavailable",
    });
  }
  return env as AdminEnv;
}
