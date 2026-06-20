import type { D1Database } from "@cloudflare/workers-types";
import type { AdminEnv } from "./env";

// Shared helpers for the admin server routes. The room listing is permanent
// history read from D1; live presence for active rooms is fetched from the relay
// over the service binding. Ported from the original Hono Worker.

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

// Overlay live presence from the relay onto a room's D1 roster: flips members
// online, merges in any currently-connected members not yet flushed to D1, and
// returns live/host/expiry. Mutates `members`.
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
