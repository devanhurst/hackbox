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

  const row = await env.DB.prepare(`SELECT code FROM rooms WHERE id = ?`)
    .bind(id)
    .first<{ code: string }>();
  if (!row) {
    setResponseStatus(event, 404);
    return { ok: false, error: "room not found" };
  }

  await env.RELAY.fetch(
    new Request(`https://relay/admin/room/${row.code}?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  );
  await env.DB.prepare(`DELETE FROM messages WHERE room_id = ?`).bind(id).run();
  await env.DB.prepare(`DELETE FROM members WHERE room_id = ?`).bind(id).run();
  await env.DB.prepare(`DELETE FROM rooms WHERE id = ?`).bind(id).run();

  return { ok: true, roomCode: row.code };
});
