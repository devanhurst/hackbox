import { type RoomRow, fetchMembersByRoom, mapRow, overlayPresence } from "../utils/rooms";

// Listing = permanent history from D1, newest first. Returns counts only (the
// per-room roster is fetched on demand by the detail view).
export default defineEventHandler(async (event) => {
  const env = getEnv(event);

  let results: RoomRow[];
  try {
    ({ results } = await env.DB.prepare(
      `SELECT * FROM rooms ORDER BY created_at DESC LIMIT 200`,
    ).all<RoomRow>());
  } catch (e) {
    // Most likely the schema hasn't been applied yet (db/schema.sql).
    setResponseStatus(event, 500);
    return { rooms: [], error: `D1 query failed: ${e}` };
  }

  // Member rosters for all listed rooms, grouped by room. Chunked under D1's
  // bound-variable cap so large histories don't blow the IN (...) clause.
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
