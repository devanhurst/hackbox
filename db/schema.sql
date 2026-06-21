-- Permanent room history (D1). One row per room *instance*: 4-character codes
-- are recycled over time, so the code is not a stable key — `id` is. Rows are
-- never deleted; a room's end is recorded via `ended_at` + `end_reason`
-- ('expired' | 'closed' | 'migrated').

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

-- Permanent member history. One row per (room instance, user) the first time a
-- user joins a room — reconnects don't add rows. `room_id` references the
-- specific `rooms.id` instance (not the recyclable code). The transient bits the
-- legacy `members` table also held (live UI `state`, `online`) are NOT recorded
-- here — those live in the Room DO; this is the durable record of who joined
-- which room, when, with what identity.
CREATE TABLE IF NOT EXISTS members (
  id         TEXT PRIMARY KEY,
  room_id    TEXT NOT NULL,      -- references rooms.id (the room instance)
  room_code  TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  user_name  TEXT NOT NULL,
  created_at INTEGER NOT NULL,   -- first joined, unix ms
  metadata   TEXT                -- JSON (e.g. twitch info), nullable
);

CREATE INDEX IF NOT EXISTS idx_members_room_id ON members (room_id);
CREATE INDEX IF NOT EXISTS idx_members_user_id ON members (user_id);

-- The relay batches frames into this table — rather than a write per frame — so
-- the chatty `change`/`state.member` traffic doesn't amplify into per-message D1
-- writes, and so the record survives the room's 24h self-destruct.
--
-- `seq` is the stable cursor the monitor pages by (timestamps can collide under load).
CREATE TABLE IF NOT EXISTS messages (
  id         TEXT PRIMARY KEY,   -- uuid
  room_id    TEXT NOT NULL,      -- references rooms.id (the room instance)
  room_code  TEXT NOT NULL,
  seq        INTEGER NOT NULL,   -- monotonic per room instance (the page cursor)
  direction  TEXT NOT NULL,      -- 'member_to_host' | 'host_to_member'
  type       TEXT NOT NULL,      -- 'msg' | 'change' | 'state.member'
  from_user  TEXT,               -- sender userId (member frames)
  to_user    TEXT,               -- recipient userId (state.member frames)
  event      TEXT,               -- payload.event for msg/change, null otherwise
  payload    TEXT,               -- JSON value (truncated if oversized)
  timestamp  INTEGER NOT NULL    -- unix ms
);

CREATE INDEX IF NOT EXISTS idx_messages_room_seq ON messages (room_id, seq);
