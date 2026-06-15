import { type RoomRow, fetchMembers, mapRow, overlayPresence } from "../../utils/rooms";

// Detail = a single room with its full member roster (+ live presence if active).
export default defineEventHandler(async (event) => {
  const env = getEnv(event);
  const id = getRouterParam(event, "id") ?? "";

  const raw = await env.DB.prepare(`SELECT * FROM rooms WHERE id = ?`).bind(id).first<RoomRow>();
  if (!raw) {
    setResponseStatus(event, 404);
    return { error: "not found" };
  }

  const room = mapRow(raw);
  const members = await fetchMembers(env.DB, id);
  let live = false;
  let hasHost = false;
  let expiresAt: number | null = null;
  if (room.endedAt == null) {
    ({ live, hasHost, expiresAt } = await overlayPresence(env, room.code, members));
  }

  return {
    room: {
      ...room,
      live: room.endedAt == null ? live : false,
      hasHost,
      expiresAt,
      members,
      memberCount: members.length,
      onlineCount: members.filter((m) => m.online).length,
    },
  };
});
