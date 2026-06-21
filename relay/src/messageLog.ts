// Message log — the admin monitor's data source.
//
// The relay is a dumb router, but the admin monitor needs to (a) watch every
// relayed frame in near-real-time and (b) see what happened in a room *before*
// the monitor was opened. This module gives the Room DO a durable, ring-trimmed
// log of the frames the monitor cares about:
//
//   member -> host : msg, change        (direction "member_to_host")
//   host -> member : state.member       (direction "host_to_member")
//
// Two tiers, by design (see db/schema.sql and CLAUDE.md's note on D1 write
// amplification):
//
//   1. DO storage  — one key per entry (`ml:<seq>`), ring-trimmed. This survives
//      WebSocket hibernation (the DO is evicted between messages, so an in-memory
//      buffer would be lost) and powers the monitor's live tail + in-room
//      history. It lives and dies with the room.
//   2. D1 `messages` — the same entries, *batched* (not one write per frame) so
//      the chatty change/state.member traffic doesn't amplify into per-message D1
//      writes. This is the permanent record; a daily relay cron purges rows past
//      the retention window (see index.ts) so D1 stays under its size cap.
//
// `seq` is a per-room-instance monotonic counter and the stable paging cursor
// (timestamps collide under load). It is assigned synchronously in append() so
// ordering holds even though onMessage can't await; the storage write + any D1
// flush ride on ctx.waitUntil.

export type MessageDirection = "member_to_host" | "host_to_member";
export type MessageType = "msg" | "change" | "state.member";

export interface LoggedMessage {
  seq: number;
  direction: MessageDirection;
  type: MessageType;
  from: string | null; // sender userId (member frames)
  to: string | null; // recipient userId (state.member frames)
  event: string | null; // payload.event for msg/change
  payload: unknown; // JSON value; replaced with a truncation marker if oversized
  timestamp: number;
}

// What a caller hands to append() — seq/timestamp are stamped here.
export type NewMessage = Omit<LoggedMessage, "seq">;

interface LogMeta {
  nextSeq: number;
  lastFlushedSeq: number;
}

// Tuning knobs. All deliberately conservative for a hobby-scale deployment.
const KEY_PREFIX = "ml:";
const META_KEY = "mlmeta";
// Entries kept in DO storage for the live tail, even after they've been flushed
// to D1. A 1.5s poll never needs more than a handful; this is generous headroom.
const MAX_BUFFER = 2000;
// Flush to D1 once this many unflushed entries have accumulated.
const FLUSH_THRESHOLD = 100;
// Cap a single stored payload. A full `state.member` screen is usually a few KB,
// but a pathological host could push much more; truncate so one frame can't
// blow the DO 128 KiB/value limit or bloat D1.
const MAX_PAYLOAD_BYTES = 8 * 1024;
// D1 caps a statement at 100 bound variables; each row binds 11 columns, so keep
// chunks at 9 rows (99 vars) and batch the chunks.
const ROWS_PER_STATEMENT = 9;

function keyFor(seq: number): string {
  return KEY_PREFIX + String(seq).padStart(16, "0");
}

// Keep payloads bounded. Returns the value unchanged when it serializes small
// enough, otherwise a self-describing marker the monitor can render as a preview.
function clampPayload(payload: unknown): unknown {
  let json: string;
  try {
    json = JSON.stringify(payload) ?? "null";
  } catch {
    return { truncated: true, reason: "unserializable" };
  }
  if (json.length <= MAX_PAYLOAD_BYTES) return payload;
  return { truncated: true, bytes: json.length, preview: json.slice(0, MAX_PAYLOAD_BYTES) };
}

export class MessageLog {
  private nextSeq = 0;
  private lastFlushedSeq = -1;
  private flushing = false;

  constructor(
    private readonly ctx: DurableObjectState,
    private readonly db: D1Database,
    private readonly code: string,
    // Resolved lazily: a room's history-row id (settings.id) isn't known until
    // settings load, and a revive swaps it. Returns null if the room isn't live.
    private readonly roomId: () => string | null,
  ) {}

  // Rehydrate counters from storage. Called from the DO's onStart (which runs on
  // every wake from hibernation), mirroring how members are reloaded there.
  async init(): Promise<void> {
    const meta = await this.ctx.storage.get<LogMeta>(META_KEY);
    if (meta) {
      this.nextSeq = meta.nextSeq;
      this.lastFlushedSeq = meta.lastFlushedSeq;
    }
  }

  // Resume the seq counter past whatever already exists in D1 for this room
  // instance. A revived room reuses its room_id (settings.id) but comes back on a
  // wiped DO, so without this its seq would restart at 0 and collide with the
  // previous session's rows. Called from the DO's restore path.
  async resumeFrom(roomId: string): Promise<void> {
    try {
      const row = await this.db
        .prepare(`SELECT MAX(seq) AS maxSeq FROM messages WHERE room_id = ?`)
        .bind(roomId)
        .first<{ maxSeq: number | null }>();
      const max = row?.maxSeq;
      if (typeof max === "number" && max >= this.nextSeq) {
        this.nextSeq = max + 1;
        this.lastFlushedSeq = max; // those rows are already in D1
        await this.ctx.storage.put<LogMeta>(META_KEY, {
          nextSeq: this.nextSeq,
          lastFlushedSeq: this.lastFlushedSeq,
        });
      }
    } catch (e) {
      console.error(`[relay ${this.code}] message log resume failed`, e);
    }
  }

  // Record a frame. Seq is assigned synchronously so callers that can't await
  // (onMessage) still get correct ordering; the durable write + opportunistic
  // flush ride on waitUntil so the hot path isn't blocked.
  append(message: NewMessage): number {
    const seq = this.nextSeq++;
    const entry: LoggedMessage = { ...message, seq, payload: clampPayload(message.payload) };
    this.ctx.waitUntil(this.persist(entry));
    return seq;
  }

  private async persist(entry: LoggedMessage): Promise<void> {
    await this.ctx.storage.put(keyFor(entry.seq), entry);
    await this.ctx.storage.put<LogMeta>(META_KEY, {
      nextSeq: this.nextSeq,
      lastFlushedSeq: this.lastFlushedSeq,
    });
    if (!this.flushing && this.nextSeq - 1 - this.lastFlushedSeq >= FLUSH_THRESHOLD) {
      await this.flush();
    }
  }

  // Batch every not-yet-flushed entry into D1, then ring-trim DO storage. Public
  // so the DO can force a final flush before it self-destructs on TTL expiry.
  // Best-effort: a failed D1 write leaves lastFlushedSeq untouched, so nothing is
  // trimmed and the entries are retried on the next flush (durability preserved
  // in DO storage meanwhile).
  async flush(): Promise<void> {
    if (this.flushing) return;
    const roomId = this.roomId();
    if (!roomId) return; // not live; nothing to anchor history to
    this.flushing = true;
    try {
      const pending = await this.ctx.storage.list<LoggedMessage>({
        prefix: KEY_PREFIX,
        start: keyFor(this.lastFlushedSeq + 1),
      });
      const entries = [...pending.values()];
      if (entries.length === 0) return;

      const statements: D1PreparedStatement[] = [];
      for (let i = 0; i < entries.length; i += ROWS_PER_STATEMENT) {
        const chunk = entries.slice(i, i + ROWS_PER_STATEMENT);
        statements.push(
          this.db
            .prepare(
              `INSERT INTO messages
                 (id, room_id, room_code, seq, direction, type, from_user, to_user, event, payload, timestamp)
               VALUES ${chunk.map(() => "(?,?,?,?,?,?,?,?,?,?,?)").join(",")}`,
            )
            .bind(
              ...chunk.flatMap((e) => [
                crypto.randomUUID(),
                roomId,
                this.code,
                e.seq,
                e.direction,
                e.type,
                e.from,
                e.to,
                e.event,
                e.payload === undefined ? null : JSON.stringify(e.payload),
                e.timestamp,
              ]),
            ),
        );
      }

      await this.db.batch(statements);

      this.lastFlushedSeq = entries[entries.length - 1]!.seq;
      await this.ctx.storage.put<LogMeta>(META_KEY, {
        nextSeq: this.nextSeq,
        lastFlushedSeq: this.lastFlushedSeq,
      });
      await this.trim();
    } catch (e) {
      console.error(`[relay ${this.code}] message flush failed`, e);
    } finally {
      this.flushing = false;
    }
  }

  // Drop entries that are both flushed *and* older than the live-tail window.
  private async trim(): Promise<void> {
    const trimBelow = Math.min(this.lastFlushedSeq + 1, this.nextSeq - MAX_BUFFER);
    if (trimBelow <= 0) return;
    const stale = await this.ctx.storage.list<LoggedMessage>({
      prefix: KEY_PREFIX,
      end: keyFor(trimBelow),
    });
    if (stale.size === 0) return;
    await this.ctx.storage.delete([...stale.keys()]);
  }

  // The live tail: buffered entries with seq > since, oldest first. `oldestSeq`
  // lets the monitor detect when it has scrolled past the buffer and must page
  // the rest from D1 history instead.
  async tail(
    since: number,
    limit: number,
  ): Promise<{ messages: LoggedMessage[]; nextSeq: number; oldestSeq: number | null }> {
    const page = await this.ctx.storage.list<LoggedMessage>({
      prefix: KEY_PREFIX,
      start: keyFor(since + 1),
      limit,
    });
    const messages = [...page.values()];
    const first = await this.ctx.storage.list<LoggedMessage>({ prefix: KEY_PREFIX, limit: 1 });
    const oldestSeq = first.size > 0 ? [...first.values()][0]!.seq : null;
    return { messages, nextSeq: this.nextSeq, oldestSeq };
  }
}
