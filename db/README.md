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
