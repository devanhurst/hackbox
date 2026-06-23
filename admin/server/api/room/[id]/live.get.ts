import { fetchLivePresence } from "../../../utils/rooms";

// The live presence overlay, polled by the room detail page. Resolves the room
// code from D1 (the relay DO is keyed by code) and proxies the relay's live
// `adminStatus()` — no D1 roster query here; the durable roster comes from the
// one-time `room/:id` load. Ended rooms have no live DO, so we skip the relay.
export default defineEventHandler(async (event) => {
  const env = getEnv(event);
  const id = getRouterParam(event, "id") ?? "";

  const room = await env.DB.prepare(`SELECT code, ended_at FROM rooms WHERE id = ?`)
    .bind(id)
    .first<{ code: string; ended_at: number | null }>();
  if (!room) {
    setResponseStatus(event, 404);
    return { error: "not found" };
  }

  if (room.ended_at != null) {
    return { live: false, hasHost: false, expiresAt: null, onlineCount: 0, members: [] };
  }

  return await fetchLivePresence(env, room.code);
});
