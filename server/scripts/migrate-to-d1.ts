import "dotenv/config";
import { writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { db, rooms } from "../db";

// One-time migration of the legacy Postgres `rooms` into the Cloudflare D1
// permanent history (db/schema.sql at the repo root). Run from server/ with the
// old DATABASE_URL set:
//
//   npx tsx scripts/migrate-to-d1.ts
//
// Every room becomes a history row marked ended/'migrated' at cutover (the old
// server is being shut down), preserving its original settings + createdAt.
// Writes `rooms-history.sql` for `wrangler d1 execute`.

const sqlEsc = (s: string) => "'" + String(s).replace(/'/g, "''") + "'";

async function main() {
  const all = await db.select().from(rooms);
  const now = Date.now();

  const lines = all.map((r) => {
    const id = randomUUID();
    const createdAt = new Date(r.createdAt).getTime();
    return (
      "INSERT INTO rooms (id, code, host_id, twitch_required, persistent, closed, created_at, ended_at, end_reason) VALUES (" +
      `${sqlEsc(id)}, ${sqlEsc(r.code)}, ${sqlEsc(r.hostId)}, ${r.twitchRequired ? 1 : 0}, ` +
      `${r.persistent ? 1 : 0}, ${r.closed ? 1 : 0}, ${createdAt}, ${now}, 'migrated');`
    );
  });

  const file = "rooms-history.sql";
  writeFileSync(file, lines.length ? lines.join("\n") + "\n" : "-- no rooms to migrate\n");

  console.log(`Wrote ${lines.length} room history rows to ${file}`);
  console.log(`Apply to D1:  npx wrangler d1 execute hackbox --remote --file=${file}`);

  process.exit(0);
}

void main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
