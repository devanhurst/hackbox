import "dotenv/config";
import { writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { db, rooms } from "../db";

// One-time migration of the legacy Postgres `rooms` into the Cloudflare D1
// permanent history (db/schema.sql at the repo root). Run from server/ with the old
// DATABASE_URL set:
//
//   npx tsx scripts/migrate-to-d1.ts
//
// It writes `rooms-history.sql` (INSERTs for every *ephemeral* room, recorded as
// ended/'migrated') for `wrangler d1 execute`, and prints the *persistent*
// room(s) for you to resurrect via the admin "Import existing room" form — that
// both re-creates the live room AND writes its permanent D1 row, so persistent
// rooms are intentionally NOT in the bulk SQL (no duplicate rows).

const sqlEsc = (s: string) => "'" + String(s).replace(/'/g, "''") + "'";

async function main() {
  const all = await db.select().from(rooms);
  const persistent = all.filter((r) => r.persistent);
  const ephemeral = all.filter((r) => !r.persistent);

  const now = Date.now();
  const lines = ephemeral.map((r) => {
    const id = randomUUID();
    const createdAt = new Date(r.createdAt).getTime();
    return (
      "INSERT INTO rooms (id, code, host_id, twitch_required, persistent, closed, created_at, ended_at, end_reason) VALUES (" +
      `${sqlEsc(id)}, ${sqlEsc(r.code)}, ${sqlEsc(r.hostId)}, ${r.twitchRequired ? 1 : 0}, 0, ` +
      `${r.closed ? 1 : 0}, ${createdAt}, ${now}, 'migrated');`
    );
  });

  const file = "rooms-history.sql";
  writeFileSync(file, lines.length ? lines.join("\n") + "\n" : "-- no ephemeral rooms to migrate\n");

  console.log(`Wrote ${lines.length} ephemeral room history rows to ${file}`);
  console.log(`Apply to D1:  npx wrangler d1 execute hackbox --remote --file=${file}`);
  console.log("");

  if (persistent.length === 0) {
    console.log("No persistent rooms found.");
  } else {
    console.log(`${persistent.length} persistent room(s) — resurrect each via the admin "Import existing room" form:`);
    for (const r of persistent) {
      console.log(
        `  code=${r.code}  hostId=${r.hostId}  twitchRequired=${!!r.twitchRequired}  ` +
          `closed=${!!r.closed}  createdAt=${new Date(r.createdAt).getTime()}`,
      );
    }
    console.log("(Importing re-creates the live room AND writes its permanent D1 row.)");
  }

  process.exit(0);
}

void main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
