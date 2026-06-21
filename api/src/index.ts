import { Hono } from "hono";
import { cors } from "hono/cors";
import { generateRoomCode, RelayClient } from "./relay";

interface Env {
  RELAY: Fetcher; // service binding to hackbox-relay
}

const MAX_CODE_ATTEMPTS = 8;

const app = new Hono<{ Bindings: Env }>().basePath("/api");

// The browser client calls GET /api/rooms/:code cross-origin, and hosts POST
// /api/rooms from arbitrary backends.
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
  // Closed rooms are invisible to anyone who isn't already a member.
  if (probe.closed && !probe.isMember) return c.json({ exists: false });

  return c.json({ exists: true, twitchRequired: probe.twitchRequired });
});

export default app;
