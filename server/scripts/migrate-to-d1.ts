import "dotenv/config";
import { writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { db, rooms, members } from "../db";

// One-time migration of the legacy Postgres `rooms` + `members` into the
// Cloudflare D1 permanent history (db/schema.sql at the repo root). Run from
// server/ with the old DATABASE_URL set:
//
//   npx tsx scripts/migrate-to-d1.ts
//
// Every room becomes a history row marked ended/'migrated' at cutover (the old
// server is being shut down), preserving its settings + createdAt. Each member
// becomes a member-history row linked to its room *instance* (the generated
// room id). Writes `migration.sql` for `wrangler d1 execute`.

const lit = (s: string) => "'" + String(s).replace(/'/g, "''") + "'";
const litOrNull = (s: unknown) => (s == null ? "NULL" : lit(typeof s === "string" ? s : JSON.stringify(s)));

async function main() {
  const allRooms = await db.select().from(rooms);
  const allMembers = await db.select().from(members);
  const now = Date.now();

  // Generate a stable D1 id per room instance and key it by code so members can
  // reference the same instance (codes are unique in the source snapshot).
  const roomIdByCode = new Map<string, string>();

  const roomLines = allRooms.map((r) => {
    const id = randomUUID();
    roomIdByCode.set(r.code, id);
    const createdAt = new Date(r.createdAt).getTime();
    return (
      "INSERT INTO rooms (id, code, host_id, twitch_required, persistent, closed, created_at, ended_at, end_reason) VALUES (" +
      `${lit(id)}, ${lit(r.code)}, ${lit(r.hostId)}, ${r.twitchRequired ? 1 : 0}, ` +
      `${r.persistent ? 1 : 0}, ${r.closed ? 1 : 0}, ${createdAt}, ${now}, 'migrated');`
    );
  });

  const memberLines = allMembers
    .filter((m) => roomIdByCode.has(m.roomCode))
    .map((m) => {
      const createdAt = new Date(m.createdAt).getTime();
      return (
        "INSERT INTO members (id, room_id, room_code, user_id, user_name, created_at, metadata) VALUES (" +
        `${lit(randomUUID())}, ${lit(roomIdByCode.get(m.roomCode)!)}, ${lit(m.roomCode)}, ` +
        `${lit(m.userId)}, ${lit(m.userName)}, ${createdAt}, ${litOrNull(m.metadata)});`
      );
    });

  const file = "migration.sql";
  // Rooms before members (members reference room ids).
  const sql = [...roomLines, ...memberLines];
  writeFileSync(file, sql.length ? sql.join("\n") + "\n" : "-- nothing to migrate\n");

  console.log(`Wrote ${roomLines.length} rooms + ${memberLines.length} members to ${file}`);
  console.log(`Apply to D1:  npx wrangler d1 execute hackbox --remote --file=${file}`);

  process.exit(0);
}

void main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
