import { getServerByName } from "partyserver";
import { Room } from "./main";

export { Room };

interface Env {
  Main: DurableObjectNamespace<Room>;
  DB: D1Database;
  ENVIRONMENT?: string; // "preview" in Worker Previews
  ADMIN_SECRET?: string; // required for /admin/* in Previews
}

const MESSAGE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Chunked because D1 has no DELETE ... LIMIT.
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

// Route `/r/<code>` by hand rather than partyserver's routePartykitRequest,
// which mandates a three-segment `/<prefix>/<party>/<room>` path — routing here
// lets the realtime endpoint be the minimal `wss://hackbox.ca/r/<code>`.
// `getServerByName` (vs a bare `stub.fetch()`) calls setName so `this.name` (the
// room code) is set.
//
// In production, `/admin/*` is served only via the admin Worker's service
// binding — the relay's only public route is `hackbox.ca/r/*` and its
// workers_dev URL is disabled, so `/admin/*` never arrives from the public
// internet. A Preview's workers.dev URL is public, so there it also requires
// ADMIN_SECRET, which the admin Preview sends, and refuses if none is set.
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const parts = new URL(request.url).pathname.split("/").filter(Boolean);

    if (parts[0] === "r" && parts[1]) {
      const stub = await getServerByName(env.Main, parts[1].toUpperCase());
      return stub.fetch(request);
    }

    if (
      parts[0] === "admin" &&
      env.ENVIRONMENT === "preview" &&
      (!env.ADMIN_SECRET || request.headers.get("x-hackbox-admin") !== env.ADMIN_SECRET)
    ) {
      return new Response("Forbidden", { status: 403 });
    }

    if (parts[0] === "admin" && parts[1] === "room" && parts[2]) {
      const stub = await getServerByName(env.Main, parts[2].toUpperCase());
      return stub.fetch(request);
    }

    return new Response("Not Found", { status: 404 });
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(purgeOldMessages(env.DB));
  },
} satisfies ExportedHandler<Env>;
