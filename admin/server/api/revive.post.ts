import { type MemberRow, type RoomRow, parseMetadata } from "../utils/rooms";

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

  const { results: memberRows } = await env.DB.prepare(
    `SELECT user_id, user_name, metadata FROM members WHERE room_id = ?`,
  )
    .bind(id)
    .all<MemberRow>();
  const members = memberRows.map((m) => ({
    userId: m.user_id,
    userName: m.user_name,
    metadata: parseMetadata(m.metadata),
  }));

  const res = await env.RELAY.fetch(
    new Request(`https://relay/r/${row.code}/init`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        restore: true,
        id: row.id,
        hostId: row.host_id,
        twitchRequired: !!row.twitch_required,
        persistent: !!row.persistent,
        closed: !!row.closed,
        members,
      }),
    }),
  );

  if (res.status === 409) {
    setResponseStatus(event, 409);
    return { ok: false, error: `${row.code} is currently live` };
  }
  if (res.ok) return { ok: true, roomCode: row.code, hostId: row.host_id };
  setResponseStatus(event, 502);
  return { ok: false, error: `relay init failed: ${res.status}` };
});
