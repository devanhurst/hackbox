# Database (Cloudflare D1)

hackbox keeps a single durable database in **Cloudflare D1**, `hackbox`, holding
the **permanent room history**. Live gameplay state does *not* live here — it
stays in the relay's `Room` Durable Objects. D1 is only the durable record of
which rooms have existed (the jparty split: live state in DOs, durable records
in D1).

- **Schema:** [`schema.sql`](./schema.sql)
- **Bindings (`DB`):** the **relay** Worker writes it (a row per room on
  creation; `ended_at` stamped on expiry), the **admin** Worker reads it (the
  monitor listing). Both bind the same database in their `wrangler.toml`.
- **Key shape:** one row per room *instance*. 4-character codes are recycled
  over time, so `id` (a UUID) is the primary key, not `code`. Rows are **never
  deleted** — a room's end is recorded via `ended_at` + `end_reason`
  (`expired` | `closed` | `migrated`).

## Apply / update the schema

```bash
# from the repo root, with wrangler authenticated to the account
npx wrangler d1 execute hackbox --remote --file=db/schema.sql
```

The relay's history writes are best-effort, so the relay won't break if the
schema isn't applied yet — rooms just won't be recorded until the table exists.

## One-time migration from the legacy Postgres

When cutting over from the old Postgres `rooms` table, import its rooms into D1
so history is continuous. **Ephemeral** rooms become `migrated`/ended history
rows; **persistent** rooms are imported via the admin UI instead (that
re-creates the live room *and* writes its D1 row, so they are intentionally
excluded from the bulk import to avoid duplicate rows).

This must be run from a machine that can reach the Postgres host (a sandboxed
CI/agent environment generally cannot open arbitrary `:5432` connections).

### Option A — psql (no Node required)

```bash
# 1. Generate D1 INSERTs for ephemeral rooms -> rooms-history.sql
PGPASSWORD=… psql -h <PGHOST> -U <PGUSER> <PGDATABASE> -At -o rooms-history.sql -c "
SELECT format(
  'INSERT INTO rooms (id, code, host_id, twitch_required, persistent, closed, created_at, ended_at, end_reason) VALUES (%L, %L, %L, %s, 0, %s, %s, %s, ''migrated'');',
  gen_random_uuid()::text, code, host_id::text, twitch_required::int, closed::int,
  (extract(epoch from created_at)*1000)::bigint, (extract(epoch from now())*1000)::bigint
) FROM rooms WHERE persistent IS NOT TRUE;"

# 2. List persistent rooms to import via the admin UI
PGPASSWORD=… psql -h <PGHOST> -U <PGUSER> <PGDATABASE> -At -c "
SELECT 'code='||code||'  hostId='||host_id||'  twitchRequired='||twitch_required||
       '  closed='||closed||'  createdAt='||(extract(epoch from created_at)*1000)::bigint
FROM rooms WHERE persistent IS TRUE;"

# 3. Load the history into D1
npx wrangler d1 execute hackbox --remote --file=rooms-history.sql
```

### Option B — Node script

`server/scripts/migrate-to-d1.ts` does the same thing using the server's Drizzle
setup. Run it from `server/` with the legacy `DATABASE_URL` set:

```bash
cd server && DATABASE_URL=… npx tsx scripts/migrate-to-d1.ts
# -> writes rooms-history.sql and prints the persistent room(s) to import
npx wrangler d1 execute hackbox --remote --file=server/rooms-history.sql
```

### Resurrect persistent rooms

For each persistent room printed above, open the admin tool
(`hackbox.ca/admin`) → **Import existing room** and enter its `code` / `hostId` /
settings / `createdAt`, keeping **persistent** checked. This re-creates the live
`Room` DO at that exact code *and* writes its permanent D1 row, so its host and
players keep connecting.
