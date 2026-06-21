import { type RoomRow, fetchMembersByRoom, mapRow, overlayPresence } from "../utils/rooms";

// Query params:
//   status — "active" (default; ended_at IS NULL), "ended", or "all"
//   code   — case-insensitive substring match on the room code
export default defineEventHandler(async (event) => {
  const env = getEnv(event);

  const query = getQuery(event);
  const status = query.status === "ended" || query.status === "all" ? query.status : "active";
  const code = typeof query.code === "string" ? query.code.trim() : "";

  const conditions: string[] = [];
  const binds: unknown[] = [];
  if (status === "active") conditions.push("ended_at IS NULL");
  else if (status === "ended") conditions.push("ended_at IS NOT NULL");
  if (code) {
    // Escape LIKE wildcards in user input; codes are uppercase, LIKE is
    // case-insensitive for ASCII in SQLite but we uppercase to be explicit.
    const escaped = code.toUpperCase().replace(/[\\%_]/g, (c) => `\\${c}`);
    conditions.push("code LIKE ? ESCAPE '\\'");
    binds.push(`%${escaped}%`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  let results: RoomRow[];
  try {
    const stmt = env.DB.prepare(`SELECT * FROM rooms ${where} ORDER BY created_at DESC LIMIT 200`);
    ({ results } = await (binds.length ? stmt.bind(...binds) : stmt).all<RoomRow>());
  } catch (e) {
    // Most likely the schema hasn't been applied yet (db/schema.sql).
    setResponseStatus(event, 500);
    return { rooms: [], error: `D1 query failed: ${e}` };
  }

  const membersByRoom = await fetchMembersByRoom(
    env.DB,
    results.map((r) => r.id),
  );

  const rooms = await Promise.all(
    results.map(async (raw) => {
      const room = mapRow(raw);
      const members = membersByRoom.get(room.id) ?? [];
      let live = false;
      let hasHost = false;
      let expiresAt: number | null = null;
      if (room.endedAt == null) {
        ({ live, hasHost, expiresAt } = await overlayPresence(env, room.code, members));
      }
      return {
        ...room,
        live: room.endedAt == null ? live : false,
        hasHost,
        expiresAt,
        memberCount: members.length,
        onlineCount: members.filter((m) => m.online).length,
      };
    }),
  );

  return { rooms };
});
