import {
  type AdminMember,
  type MemberRow,
  type RoomRow,
  mapRow,
  overlayPresence,
  twitchName,
} from "../utils/rooms";

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

  // Member rosters for all listed rooms, in a single query, grouped by room.
  const membersByRoom = new Map<string, AdminMember[]>();
  if (results.length) {
    const placeholders = results.map(() => "?").join(",");
    const { results: memberRows } = await env.DB.prepare(
      `SELECT room_id, user_id, user_name, metadata FROM members WHERE room_id IN (${placeholders})`,
    )
      .bind(...results.map((r) => r.id))
      .all<MemberRow & { room_id: string }>();
    for (const m of memberRows) {
      const list = membersByRoom.get(m.room_id) ?? [];
      list.push({
        userId: m.user_id,
        userName: m.user_name,
        twitch: twitchName(m.metadata),
        online: false,
      });
      membersByRoom.set(m.room_id, list);
    }
  }

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
