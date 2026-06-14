-- Permanent room history (D1). One row per room *instance*: 4-character codes
-- are recycled over time, so the code is not a stable key — `id` is. Rows are
-- never deleted; a room's end is recorded via `ended_at` + `end_reason`
-- ('expired' | 'closed' | 'migrated'). The relay's Room DO writes a row on
-- creation and stamps `ended_at` when its 24h alarm fires.
--
-- Mirrors the legacy Postgres `rooms` table (host_id / twitch_required /
-- persistent / closed / created_at), plus the lifecycle columns for permanence.

CREATE TABLE IF NOT EXISTS rooms (
  id              TEXT PRIMARY KEY,
  code            TEXT NOT NULL,
  host_id         TEXT NOT NULL,
  twitch_required INTEGER NOT NULL DEFAULT 0,
  persistent      INTEGER NOT NULL DEFAULT 0,
  closed          INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,   -- unix ms
  ended_at        INTEGER,            -- null while active
  end_reason      TEXT
);

CREATE INDEX IF NOT EXISTS idx_rooms_created_at ON rooms (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms (code);
