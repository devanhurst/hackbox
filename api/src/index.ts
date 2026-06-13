import { Hono } from "hono";
import { cors } from "hono/cors";
import { generateRoomCode, RelayClient } from "./relay";

// HTTP front door for hackbox, ported from the legacy Express `server/api.ts`.
// Served under the apex at hackbox.ca/api/* (a path prefix, not an `api.`
// subdomain — subdomains get reset by some users' SNI-filtering middleboxes):
//   POST /api/rooms             -> { ok, roomCode }
//   GET  /api/rooms/:roomCode   -> { exists, twitchRequired } | { exists: false }
//   GET  /api/healthcheck       -> { ok: true }
// All room state lives in the relay Worker's Durable Objects; this Worker only
// allocates codes and answers existence probes.

interface Env {
  RELAY: Fetcher; // service binding to hackbox-relay
}

// How many fresh codes to try before giving up. The consonant space is
// 20^4 = 160k, so collisions are vanishingly rare; a handful of retries is
// plenty of headroom (mirrors the legacy recursive retry in Room.create).
const MAX_CODE_ATTEMPTS = 8;

// basePath("/api") so every route is served under the apex /api prefix
// (the Cloudflare route hackbox.ca/api/* forwards the full path through).
const app = new Hono<{ Bindings: Env }>().basePath("/api");

// The legacy server used `cors({ origin: "*" })`. The browser client calls
// GET /api/rooms/:code cross-origin, and hosts POST /api/rooms from arbitrary backends.
app.use("*", cors({ origin: "*" }));

app.get("/healthcheck", (c) => c.json({ ok: true }));

app.post("/rooms", async (c) => {
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const hostId = body.hostId as string | undefined;
  if (!hostId) {
    return c.json({ ok: false, error: "hostId required" }, 400);
  }
  const twitchRequired = Boolean(body.twitchRequired);

  const relay = new RelayClient(c.env.RELAY);
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const code = generateRoomCode();
    if (await relay.initRoom(code, hostId, twitchRequired)) {
      return c.json({ ok: true, roomCode: code });
    }
  }

  return c.json({ ok: false, error: "Could not allocate a room code." }, 503);
});

app.get("/rooms/:roomCode", async (c) => {
  const roomCode = c.req.param("roomCode").toUpperCase();
  const userId = c.req.query("userId");

  const relay = new RelayClient(c.env.RELAY);
  const probe = await relay.probeRoom(roomCode, userId);

  if (!probe.exists) return c.json({ exists: false });
  // Closed rooms are invisible to anyone who isn't already a member, matching
  // the legacy GET /rooms/:roomCode behaviour.
  if (probe.closed && !probe.isMember) return c.json({ exists: false });

  return c.json({ exists: true, twitchRequired: probe.twitchRequired });
});

export default app;
