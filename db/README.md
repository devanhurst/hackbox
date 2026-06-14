# Database (Cloudflare D1)

hackbox keeps a single durable database in **Cloudflare D1**, `hackbox`, holding
the **permanent room + member history**. Live gameplay state does *not* live
here — it stays in the relay's `Room` Durable Objects. D1 is only the durable
record of which rooms have existed and who joined them (the jparty split: live
state in DOs, durable records in D1).

- **Schema:** [`schema.sql`](./schema.sql) — `rooms` and `members`.
- **Bindings (`DB`):** the **relay** Worker writes it (a `rooms` row per room on
  creation + `ended_at` on expiry; a `members` row on each user's first join),
  the **admin** Worker reads it (the monitor listing). Both bind the same
  database in their `wrangler.toml`.
- **Key shape:** one `rooms` row per room *instance*. 4-character codes are
  recycled over time, so `id` (a UUID) is the primary key, not `code`. Rows are
  **never deleted** — a room's end is recorded via `ended_at` + `end_reason`
  (`expired` | `closed` | `migrated`). Each `members` row references its room
  instance via `room_id`.

## Apply / update the schema

```bash
# from the repo root, with wrangler authenticated to the account
npx wrangler d1 execute hackbox --remote --file=db/schema.sql
```

The relay's history writes are best-effort, so the relay won't break if the
schema isn't applied yet — rooms just won't be recorded until the table exists.

## One-time migration from the legacy Postgres

When cutting over from the old Postgres `rooms` + `members` tables, import them
into D1 so history is continuous. Every room becomes a `rooms` row marked
`migrated` / ended at cutover (the old server is being shut down), preserving its
settings and `createdAt`; every member becomes a `members` row linked to its
room instance.

This must be run from a machine that can reach the Postgres host (a sandboxed
CI/agent environment generally cannot open arbitrary `:5432` connections).

> Resurrecting a room as *live* afterwards (rare) is a separate, manual step:
> the admin tool's **Import existing room** form re-creates a `Room` DO at a
> specific code. It is not part of this bulk data migration.

### Option A — Node script

`server/scripts/migrate-to-d1.ts` reads both tables via the server's Drizzle
setup and links each member to its room's generated `id`. Run it from `server/`
with the legacy `DATABASE_URL` set:

```bash
cd server && DATABASE_URL=… npx tsx scripts/migrate-to-d1.ts
# -> writes migration.sql (rooms + members)
npx wrangler d1 execute hackbox --remote --file=server/migration.sql
```

### Option B — psql (no Node required)

One query emits both tables; the CTE generates each room `id` once so the
`members` rows reference the same instance:

```bash
PGPASSWORD=… psql -h <PGHOST> -U <PGUSER> <PGDATABASE> -At -o migration.sql -c "
WITH r AS MATERIALIZED (
  SELECT code, gen_random_uuid()::text AS rid, host_id::text AS host_id,
         twitch_required::int AS tr, persistent::int AS pe, closed::int AS cl,
         (extract(epoch from created_at)*1000)::bigint AS ca
  FROM rooms
)
SELECT sql FROM (
  SELECT 0 AS ord, format(
    'INSERT INTO rooms (id, code, host_id, twitch_required, persistent, closed, created_at, ended_at, end_reason) VALUES (%L, %L, %L, %s, %s, %s, %s, %s, ''migrated'');',
    r.rid, r.code, r.host_id, r.tr, r.pe, r.cl, r.ca, (extract(epoch from now())*1000)::bigint
  ) AS sql FROM r
  UNION ALL
  SELECT 1 AS ord, format(
    'INSERT INTO members (id, room_id, room_code, user_id, user_name, created_at, metadata) VALUES (%L, %L, %L, %L, %L, %s, %L);',
    gen_random_uuid()::text, r.rid, m.room_code, m.user_id::text, m.user_name,
    (extract(epoch from m.created_at)*1000)::bigint, m.metadata::text
  ) AS sql FROM members m JOIN r ON m.room_code = r.code
) q ORDER BY ord;"

npx wrangler d1 execute hackbox --remote --file=migration.sql
```
