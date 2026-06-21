import { getServerByName } from "partyserver";
import { Room } from "./main";

export { Room };

interface Env {
  Main: DurableObjectNamespace<Room>;
  DB: D1Database;
}

// Retention for the permanent message log (db/schema.sql `messages`). The DO
// keeps everything for the room's life; this daily cron bounds the durable copy
// so D1 stays well under its size cap (see the scheduled handler below).
const MESSAGE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Delete message rows past the retention window, chunked so a single statement
// never deletes an unbounded number of rows (D1 has no DELETE ... LIMIT).
async function purgeOldMessages(db: D1Database): Promise<void> {
  const cutoff = Date.now() - MESSAGE_RETENTION_MS;
  for (let i = 0; i < 1000; i++) {
    const res = await db
      .prepare(
        `DELETE FROM messages WHERE id IN (SELECT id FROM messages WHERE timestamp < ? LIMIT 500)`,
      )
      .bind(cutoff)
      .run();
    if ((res.meta?.changes ?? 0) < 500) break;
  }
}

// Worker entry. We route `/r/<code>` ourselves rather than using partyserver's
// routePartykitRequest, which mandates a three-segment `/<prefix>/<party>/<room>`
// path. Routing by hand lets the realtime endpoint be the minimal
// `wss://hackbox.ca/r/<code>` (a single static prefix is still required: the apex
// serves the SPA and Cloudflare routes by path, not by the WebSocket Upgrade
// header, so the relay needs its own path to be routable).
//
// `getServerByName` resolves the Durable Object by name and calls its setName
// RPC, so `this.name` (the room code) is set correctly — the part the bare
// `stub.fetch()` would otherwise miss. Both the WebSocket upgrade and the api
// Worker's HTTP calls (`/r/<code>` and `/r/<code>/init`) flow through here;
// trailing path segments are handled by the DO's onRequest.
//
// `/admin/room/<code>` returns a room's live presence (host connected, member
// roster + online counts) for the admin monitor. It is served only via the
// admin Worker's service binding — the relay's only public route is
// `hackbox.ca/r/*` and its workers_dev URL is disabled, so `/admin/*` never
// arrives from the public internet. (The room *listing* is read from D1 by the
// admin Worker directly; the relay only supplies live presence.)
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const parts = new URL(request.url).pathname.split("/").filter(Boolean);

    if (parts[0] === "r" && parts[1]) {
      const stub = await getServerByName(env.Main, parts[1].toUpperCase());
      return stub.fetch(request);
    }

    if (parts[0] === "admin" && parts[1] === "room" && parts[2]) {
      const stub = await getServerByName(env.Main, parts[2].toUpperCase());
      return stub.fetch(request);
    }

    return new Response("Not Found", { status: 404 });
  },

  // Daily retention sweep for the permanent message log (cron in wrangler.toml).
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(purgeOldMessages(env.DB));
  },
} satisfies ExportedHandler<Env>;
