import {
  enrichMessageNames,
  fetchLiveMessages,
  fetchMembers,
  fetchMessageHistory,
} from "../../../utils/rooms";

// Two query modes:
//   ?since=<seq>            live tail from the relay's DO buffer (active rooms)
//   ?before=<seq>&limit=<n> permanent history from D1, newest-first page
// Both return messages oldest-first (ascending seq).
function intParam(v: unknown, fallback: number): number {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isFinite(n) ? n : fallback;
}

export default defineEventHandler(async (event) => {
  const env = getEnv(event);
  const id = getRouterParam(event, "id") ?? "";
  const query = getQuery(event);
  const limit = Math.min(Math.max(intParam(query.limit, 200), 1), 500);

  const room = await env.DB.prepare(`SELECT code, ended_at FROM rooms WHERE id = ?`)
    .bind(id)
    .first<{ code: string; ended_at: number | null }>();
  if (!room) {
    setResponseStatus(event, 404);
    return { error: "not found" };
  }

  // Resolve user ids to chosen display names. Fetched fresh per request so the
  // log keeps up with members who joined after the page first loaded.
  const members = await fetchMembers(env.DB, id);
  const nameById = new Map(members.map((m) => [m.userId, m.userName]));

  if (query.before !== undefined) {
    const before = intParam(query.before, Number.MAX_SAFE_INTEGER);
    const messages = enrichMessageNames(
      await fetchMessageHistory(env.DB, id, before, limit),
      nameById,
    );
    return { messages, source: "history" as const, hasMore: messages.length === limit };
  }

  if (room.ended_at == null) {
    const since = intParam(query.since, -1);
    const live = await fetchLiveMessages(env, room.code, since, limit);
    if (live) {
      enrichMessageNames(live.messages, nameById);
      return { ...live, source: "live" as const };
    }
  }

  const messages = enrichMessageNames(
    await fetchMessageHistory(env.DB, id, Number.MAX_SAFE_INTEGER, limit),
    nameById,
  );
  return {
    messages,
    nextSeq: messages.length ? messages[messages.length - 1]!.seq + 1 : 0,
    oldestSeq: messages.length ? messages[0]!.seq : null,
    source: "history" as const,
    hasMore: messages.length === limit,
  };
});
