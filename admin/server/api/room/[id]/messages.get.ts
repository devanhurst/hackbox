import { fetchLiveMessages, fetchMessageHistory } from "../../../utils/rooms";

// The admin monitor's message feed for one room instance. Two modes:
//
//   ?since=<seq>            live tail from the relay's DO buffer (active rooms) —
//                           the near-real-time poll the monitor runs every ~1.5s.
//   ?before=<seq>&limit=<n> permanent history from D1, newest-first page —
//                           "load older", and the source for ended rooms whose
//                           live buffer is gone.
//
// Both return messages oldest-first (ascending seq) so the client appends
// (live) or prepends ("load older") without re-sorting.
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

  // History paging — always from D1, regardless of whether the room is live.
  if (query.before !== undefined) {
    const before = intParam(query.before, Number.MAX_SAFE_INTEGER);
    const messages = await fetchMessageHistory(env.DB, id, before, limit);
    return { messages, source: "history" as const, hasMore: messages.length === limit };
  }

  // Live tail — the relay's DO buffer, for an active room.
  if (room.ended_at == null) {
    const since = intParam(query.since, -1);
    const live = await fetchLiveMessages(env, room.code, since, limit);
    if (live) return { ...live, source: "live" as const };
  }

  // Ended room (or relay unreachable): seed from the newest D1 history page.
  const messages = await fetchMessageHistory(env.DB, id, Number.MAX_SAFE_INTEGER, limit);
  return {
    messages,
    nextSeq: messages.length ? messages[messages.length - 1]!.seq + 1 : 0,
    oldestSeq: messages.length ? messages[0]!.seq : null,
    source: "history" as const,
    hasMore: messages.length === limit,
  };
});
