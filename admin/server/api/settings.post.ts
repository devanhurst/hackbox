import type { RoomRow } from "../utils/rooms";

// Update a room's settings (twitchRequired / persistent / closed). Always writes
// the D1 history row; if the room is live, also patches the Room DO (which
// reconciles its expiry alarm to the new persistence setting).
export default defineEventHandler(async (event) => {
  const env = getEnv(event);
  const body = await readBody<Record<string, unknown>>(event).catch(
    () => ({}) as Record<string, unknown>,
  );
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) {
    setResponseStatus(event, 400);
    return { ok: false, error: "id required" };
  }

  const row = await env.DB.prepare(`SELECT * FROM rooms WHERE id = ?`).bind(id).first<RoomRow>();
  if (!row) {
    setResponseStatus(event, 404);
    return { ok: false, error: "room not found" };
  }

  const twitchRequired =
    typeof body.twitchRequired === "boolean" ? body.twitchRequired : !!row.twitch_required;
  const persistent = typeof body.persistent === "boolean" ? body.persistent : !!row.persistent;
  const closed = typeof body.closed === "boolean" ? body.closed : !!row.closed;

  await env.DB.prepare(
    `UPDATE rooms SET twitch_required = ?, persistent = ?, closed = ? WHERE id = ?`,
  )
    .bind(twitchRequired ? 1 : 0, persistent ? 1 : 0, closed ? 1 : 0, id)
    .run();

  // Live room → patch the Room DO so the change (and its alarm) takes effect now.
  if (row.ended_at == null) {
    await env.RELAY.fetch(
      new Request(`https://relay/admin/room/${row.code}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, twitchRequired, persistent, closed }),
      }),
    );
  }

  return { ok: true };
});
