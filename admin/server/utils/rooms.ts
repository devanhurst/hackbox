import type { D1Database } from "@cloudflare/workers-types";
import type { AdminEnv } from "./env";

export interface RoomRow {
  id: string;
  code: string;
  host_id: string;
  twitch_required: number;
  persistent: number;
  closed: number;
  created_at: number;
  ended_at: number | null;
  end_reason: string | null;
}

export interface MemberRow {
  user_id: string;
  user_name: string;
  metadata: string | null;
}

export interface AdminMember {
  userId: string;
  userName: string;
  twitch: string | null;
  online: boolean;
}

export function twitchName(metadata: string | null): string | null {
  if (!metadata) return null;
  try {
    const m = JSON.parse(metadata) as { twitch?: { username?: string } };
    return m?.twitch?.username ?? null;
  } catch {
    return null;
  }
}

export function parseMetadata(metadata: string | null): unknown {
  if (!metadata) return undefined;
  try {
    return JSON.parse(metadata);
  } catch {
    return undefined;
  }
}

export function mapRow(r: RoomRow) {
  return {
    id: r.id,
    code: r.code,
    hostId: r.host_id,
    twitchRequired: !!r.twitch_required,
    persistent: !!r.persistent,
    closed: !!r.closed,
    createdAt: r.created_at,
    endedAt: r.ended_at,
    endReason: r.end_reason,
  };
}

export async function fetchMembers(db: D1Database, roomId: string): Promise<AdminMember[]> {
  const { results } = await db
    .prepare(`SELECT user_id, user_name, metadata FROM members WHERE room_id = ?`)
    .bind(roomId)
    .all<MemberRow>();
  return results.map((m) => ({
    userId: m.user_id,
    userName: m.user_name,
    twitch: twitchName(m.metadata),
    online: false,
  }));
}

// D1/SQLite caps a single statement at 100 bound variables, so an
// `IN (?, ?, …)` over every listed room overflows once history grows past ~100
// rooms. Chunk the ids under that cap and merge the rosters by room id.
const D1_MAX_VARIABLES = 90;

export async function fetchMembersByRoom(
  db: D1Database,
  roomIds: string[],
): Promise<Map<string, AdminMember[]>> {
  const byRoom = new Map<string, AdminMember[]>();
  for (let i = 0; i < roomIds.length; i += D1_MAX_VARIABLES) {
    const chunk = roomIds.slice(i, i + D1_MAX_VARIABLES);
    const placeholders = chunk.map(() => "?").join(",");
    const { results } = await db
      .prepare(
        `SELECT room_id, user_id, user_name, metadata FROM members WHERE room_id IN (${placeholders})`,
      )
      .bind(...chunk)
      .all<MemberRow & { room_id: string }>();
    for (const m of results) {
      const list = byRoom.get(m.room_id) ?? [];
      list.push({
        userId: m.user_id,
        userName: m.user_name,
        twitch: twitchName(m.metadata),
        online: false,
      });
      byRoom.set(m.room_id, list);
    }
  }
  return byRoom;
}

export interface AdminMessage {
  seq: number;
  direction: "member_to_host" | "host_to_member";
  type: "msg" | "change" | "state.member";
  from: string | null;
  to: string | null;
  event: string | null;
  payload: unknown;
  timestamp: number;
}

interface MessageRow {
  seq: number;
  direction: string;
  type: string;
  from_user: string | null;
  to_user: string | null;
  event: string | null;
  payload: string | null;
  timestamp: number;
}

function mapMessageRow(r: MessageRow): AdminMessage {
  return {
    seq: r.seq,
    direction: r.direction as AdminMessage["direction"],
    type: r.type as AdminMessage["type"],
    from: r.from_user,
    to: r.to_user,
    event: r.event,
    payload: r.payload == null ? null : (parseMetadata(r.payload) ?? r.payload),
    timestamp: r.timestamp,
  };
}

export async function fetchMessageHistory(
  db: D1Database,
  roomId: string,
  before: number,
  limit: number,
): Promise<AdminMessage[]> {
  const { results } = await db
    .prepare(
      `SELECT seq, direction, type, from_user, to_user, event, payload, timestamp
         FROM messages WHERE room_id = ? AND seq < ? ORDER BY seq DESC LIMIT ?`,
    )
    .bind(roomId, before, limit)
    .all<MessageRow>();
  return results.map(mapMessageRow).reverse();
}

export async function fetchLiveMessages(
  env: AdminEnv,
  code: string,
  since: number,
  limit: number,
): Promise<{ messages: AdminMessage[]; nextSeq: number; oldestSeq: number | null } | null> {
  try {
    const res = await env.RELAY.fetch(
      new Request(`https://relay/admin/room/${code}/messages?since=${since}&limit=${limit}`),
    );
    if (!res.ok) return null;
    const p = (await res.json()) as {
      messages?: AdminMessage[];
      nextSeq?: number;
      oldestSeq?: number | null;
    };
    return {
      messages: p.messages ?? [],
      nextSeq: p.nextSeq ?? since + 1,
      oldestSeq: p.oldestSeq ?? null,
    };
  } catch {
    return null;
  }
}

export async function overlayPresence(
  env: AdminEnv,
  code: string,
  members: AdminMember[],
): Promise<{ live: boolean; hasHost: boolean; expiresAt: number | null }> {
  try {
    const res = await env.RELAY.fetch(new Request(`https://relay/admin/room/${code}`));
    if (res.ok) {
      const p = (await res.json()) as {
        exists?: boolean;
        hasHost?: boolean;
        expiresAt?: number | null;
        members?: { userId: string; userName: string; online: boolean; twitch: string | null }[];
      };
      const byId = new Map(members.map((m) => [m.userId, m]));
      for (const lm of p.members ?? []) {
        let m = byId.get(lm.userId);
        if (!m) {
          m = {
            userId: lm.userId,
            userName: lm.userName,
            twitch: lm.twitch ?? null,
            online: false,
          };
          members.push(m);
          byId.set(lm.userId, m);
        }
        if (lm.online) m.online = true;
      }
      return {
        live: p.exists !== false,
        hasHost: Boolean(p.hasHost),
        expiresAt: p.expiresAt ?? null,
      };
    }
  } catch {
    /* fall through */
  }
  return { live: false, hasHost: false, expiresAt: null };
}
