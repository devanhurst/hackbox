import { Server, type Connection, type ConnectionContext } from "partyserver";
import { defaultMemberState, sanitizeState, stripNullBytes, type MemberState } from "./roomState";
import { authenticateWithTwitch, type TwitchMetadata } from "./twitch";

// ---------------------------------------------------------------------------
// Wire protocol
// ---------------------------------------------------------------------------
// Every WebSocket frame is a JSON envelope `{ type, payload }`. The hackbox
// client SDK maps this 1:1 onto the legacy socket.io API: `socket.emit(type,
// payload)` sends `{ type, payload }`, and `socket.on(type, cb)` dispatches
// `payload` to `cb`. That preserves the *application* protocol (event names +
// payloads documented at app.hackbox.ca/docs) byte-for-byte; only the
// transport changes from socket.io/engine.io to raw WebSocket.
//
//   host -> relay : member.update { to, data }, reload
//   relay -> host : state.host { members }, msg { ... }, change { ... }
//   member -> relay: msg { event, value }, change { event, value }
//   relay -> member: state.member <MemberState>, reload, error { message }
//
// The relay is otherwise a dumb router (same role as the jparty relay). Its one
// stateful job is the *replay cache*: it remembers the last state addressed to
// each member and replays it on (re)connect — exactly what the Postgres
// `members.state` column did, now living in DO storage instead.

interface Envelope {
  type: string;
  payload?: unknown;
}

// Per-connection attachment. Lives in the connection's hibernatable state, so
// it survives the DO being evicted from memory between messages.
interface ConnState {
  role: "host" | "member";
  userId: string;
  userName: string;
}

// Room-level coordination metadata, persisted under the "settings" key. A room
// "exists" iff this record is present (replacing the `rooms` row). Cached in
// memory on start and refreshed from storage after a hibernation eviction.
interface RoomSettings {
  // Unique per room instance (codes are recycled), used as the D1 history key.
  id: string;
  hostId: string;
  twitchRequired: boolean;
  persistent: boolean;
  closed: boolean;
  createdAt: number;
}

interface MemberMetadata {
  twitch?: TwitchMetadata;
}

// Per-member record, persisted under `m:${userId}`. This is the relay's replay
// cache + presence roster source. `online` is *not* stored — it is derived from
// whether a live connection for the userId currently exists, matching the
// legacy server which computed online status from active sockets.
interface MemberRecord {
  userId: string;
  userName: string;
  metadata: MemberMetadata;
  state: MemberState;
}

// Non-reconnectable close code. The client SDK treats >= 4000 as fatal: stop
// reconnecting and surface the preceding `error` message (the legacy
// `disconnect(socket, message)` helper did emit-error-then-disconnect).
const FATAL_CLOSE = 4000;

// Rooms are ephemeral: they self-destruct 24h after creation unless persistent.
// This replaces the legacy `cleanup-old-rooms.ts` cron with a DO alarm.
const ROOM_TTL_MS = 24 * 60 * 60 * 1000;

function corsHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    ...extra,
  };
}

interface Env {
  TWITCH_CLIENT_ID?: string;
  // Permanent room history (see src/db/schema.sql). The Room DO records its own
  // lifecycle here: a row on creation, an `ended_at` stamp on expiry.
  DB: D1Database;
}

export class Room extends Server<Env> {
  // Enable WebSocket Hibernation — the DO is evicted from memory between
  // messages, so an idle room costs nothing. Durable state lives in storage
  // (settings + member records) and in each connection's attachment; nothing on
  // the instance is authoritative beyond the in-memory caches we rehydrate in
  // onStart().
  static options = { hibernate: true };

  private settings: RoomSettings | null = null;
  private members = new Map<string, MemberRecord>();

  async onStart() {
    this.settings = (await this.ctx.storage.get<RoomSettings>("settings")) ?? null;

    const stored = await this.ctx.storage.list<MemberRecord>({ prefix: "m:" });
    this.members = new Map();
    for (const record of stored.values()) {
      this.members.set(record.userId, record);
    }

    // Answer client keepalive pings at the edge without waking the DO from
    // hibernation (mirrors the jparty relay). The client SDK sends "ping" on a
    // ~25s interval to keep NAT/middlebox idle timeouts from dropping otherwise
    // silent sockets; re-applied on every start so it survives eviction.
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  // -------------------------------------------------------------------------
  // HTTP surface (room lifecycle + existence checks)
  // -------------------------------------------------------------------------
  async onRequest(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const url = new URL(req.url);

    // POST .../init — initialise the room (called by the api Worker's
    // POST /rooms after it has allocated a unique code). Returns 409 if the
    // room already exists so the caller can retry with a fresh code.
    if (req.method === "POST" && url.pathname.endsWith("/init")) {
      if (this.settings) {
        return Response.json({ ok: false, error: "exists" }, { status: 409, headers: corsHeaders() });
      }

      const body = (await req.json().catch(() => null)) as
        | {
            hostId?: string;
            twitchRequired?: boolean;
            persistent?: boolean;
            closed?: boolean;
            // Optional: preserve the original creation time when importing an
            // existing room (e.g. migrating the persistent room from Postgres).
            createdAt?: number;
          }
        | null;

      if (!body?.hostId) {
        return Response.json({ ok: false, error: "hostId required" }, { status: 400, headers: corsHeaders() });
      }

      const settings: RoomSettings = {
        id: crypto.randomUUID(),
        hostId: body.hostId,
        twitchRequired: Boolean(body.twitchRequired),
        persistent: Boolean(body.persistent),
        closed: Boolean(body.closed),
        createdAt: typeof body.createdAt === "number" ? body.createdAt : Date.now(),
      };
      this.settings = settings;
      await this.ctx.storage.put("settings", settings);
      // Persistent rooms never expire; ephemeral rooms self-destruct after 24h.
      // (An imported ephemeral room with a past createdAt would expire at once —
      // we only ever import the persistent room live, so this is moot.)
      if (!settings.persistent) {
        await this.ctx.storage.setAlarm(settings.createdAt + ROOM_TTL_MS);
      }
      await this.recordRoomCreated(settings);

      return Response.json({ ok: true, roomCode: this.name }, { headers: corsHeaders() });
    }

    // GET .../admin/room/<code> — rich live status for the admin monitor. Only
    // reachable via a direct DO-to-DO call from the Registry (the relay Worker's
    // only public route is /r/*, and workers_dev is off), never from the public
    // internet.
    if (req.method === "GET" && url.pathname.startsWith("/admin/room/")) {
      return this.adminStatus();
    }

    // GET — existence + status probe (replaces `Room.find`). Used by the client
    // before connecting and by the api Worker's GET /rooms/:code. When a
    // `userId` is supplied, `isMember` reports whether that user has a record in
    // this room — the api Worker needs it to hide closed rooms from non-members.
    if (req.method === "GET") {
      const userId = url.searchParams.get("userId");
      return Response.json(
        {
          exists: this.settings !== null,
          closed: this.settings?.closed ?? false,
          twitchRequired: this.settings?.twitchRequired ?? false,
          hasHost: this.findHostConnection() !== null,
          isMember: userId ? this.members.has(userId) : false,
        },
        { headers: corsHeaders({ "Cache-Control": "no-store" }) },
      );
    }

    return new Response("Method not allowed", { status: 405, headers: corsHeaders() });
  }

  // -------------------------------------------------------------------------
  // Connection lifecycle
  // -------------------------------------------------------------------------
  // Identity is derived entirely from the handshake query params (userId,
  // userName, metadata) — there is no separate `identify` message. This matches
  // the legacy contract where a host/player simply opens a socket with query
  // params and starts listening, so existing third-party hosts only need to
  // swap their transport library, not change their flow.
  async onConnect(connection: Connection<ConnState>, ctx: ConnectionContext) {
    // Scrub NUL bytes from handshake values up front, mirroring the legacy
    // RoomService.join (SERVER-3QY). Everything downstream — userId, userName,
    // and the parsed metadata — reads from these.
    const url = new URL(ctx.request.url);
    const userId = stripNullBytes(url.searchParams.get("userId") ?? "");
    const userName = stripNullBytes(url.searchParams.get("userName") ?? "");

    if (!this.settings) {
      this.fail(connection, "This room does not exist.");
      return;
    }

    if (!userId) {
      this.fail(connection, "Missing user id.");
      return;
    }

    if (userId === this.settings.hostId) {
      this.joinAsHost(connection, userId, userName);
    } else {
      await this.joinAsMember(connection, ctx, userId, userName);
    }
  }

  private joinAsHost(connection: Connection<ConnState>, userId: string, userName: string) {
    connection.setState({ role: "host", userId, userName });
    // Bring the freshly connected host up to date with the current roster.
    this.sendStateToHosts();
  }

  private async joinAsMember(
    connection: Connection<ConnState>,
    ctx: ConnectionContext,
    userId: string,
    userName: string,
  ) {
    const settings = this.settings!;
    const url = new URL(ctx.request.url);

    let handshakeMetadata: { twitchAccessToken?: string } = {};
    try {
      handshakeMetadata = stripNullBytes(JSON.parse(url.searchParams.get("metadata") ?? "{}"));
    } catch {
      handshakeMetadata = {};
    }

    const metadata: MemberMetadata = {
      twitch: await authenticateWithTwitch(handshakeMetadata.twitchAccessToken, this.env.TWITCH_CLIENT_ID),
    };

    const existing = this.members.get(userId);

    if (settings.closed && !existing) {
      this.fail(connection, "This room is closed.");
      return;
    }

    if (settings.twitchRequired && !metadata.twitch) {
      this.fail(connection, "Please log in with Twitch before joining this room.");
      return;
    }

    // One live connection per user: kick any older device sharing this userId,
    // mirroring the legacy "You have connected from another device." behaviour.
    for (const conn of this.getConnections<ConnState>()) {
      if (conn.id !== connection.id && conn.state?.userId === userId) {
        this.fail(conn, "You have connected from another device.");
      }
    }

    const record: MemberRecord = existing
      ? { ...existing, userName, metadata }
      : {
          userId,
          userName: userName.toUpperCase(),
          metadata,
          state: sanitizeState(defaultMemberState(userName)),
        };

    this.members.set(userId, record);
    await this.ctx.storage.put(`m:${userId}`, record);

    connection.setState({ role: "member", userId, userName });

    // Replay the member's last-known UI so a reconnecting player lands back on
    // their current screen instead of a blank one (the replay-cache job).
    connection.send(this.encode("state.member", record.state));

    this.sendStateToHosts();
  }

  async onClose(connection: Connection<ConnState>) {
    // `online` is derived from live connections, so simply re-broadcasting the
    // roster after a disconnect flips the right member to offline. (No storage
    // write needed — the member record persists for reconnect/replay.)
    if (connection.state?.role === "member") {
      this.sendStateToHosts();
    }
  }

  // -------------------------------------------------------------------------
  // Message routing
  // -------------------------------------------------------------------------
  onMessage(sender: Connection<ConnState>, message: string | ArrayBuffer | ArrayBufferView) {
    if (typeof message !== "string") return;
    // Legacy/keepalive frames handled by setWebSocketAutoResponse never reach
    // here, but guard against stray "ping" strings from older clients anyway.
    if (message === "ping") return;

    let envelope: Envelope;
    try {
      envelope = JSON.parse(message);
    } catch {
      return;
    }

    const state = sender.state;
    if (!state) return; // not yet identified

    if (state.role === "host") {
      this.handleHostMessage(envelope);
    } else {
      this.handleMemberMessage(sender, state, envelope);
    }
  }

  private handleHostMessage(envelope: Envelope) {
    if (envelope.type === "member.update") {
      const { to, data } = (envelope.payload ?? {}) as { to?: string | string[]; data?: Partial<MemberState> };
      if (to === undefined || data === undefined) return;
      void this.updateMemberStates([to].flat(), data);
      return;
    }

    if (envelope.type === "reload") {
      this.broadcastToMembers(this.encode("reload"));
    }
  }

  private handleMemberMessage(sender: Connection<ConnState>, state: ConnState, envelope: Envelope) {
    // `msg` (submitted) and `change` (work-in-progress) share a shape; the relay
    // stamps the sender and a timestamp and forwards to the host(s), exactly as
    // the legacy memberSocket did.
    if (envelope.type !== "msg" && envelope.type !== "change") return;

    const payload = envelope.payload as { event?: string; value?: unknown } | undefined;
    if (!payload) return;

    this.sendToHosts(
      this.encode(envelope.type, {
        from: state.userId,
        event: payload.event,
        message: payload,
        timestamp: Date.now(),
      }),
    );
  }

  // Apply a host state update to the named recipients: sanitize, cache for
  // replay, and push to any live connection. Only recipients with an existing
  // member record are updated — mirrors the legacy `updateMemberStates`, which
  // resolved recipients against existing `members` rows.
  private async updateMemberStates(recipients: string[], newState: Partial<MemberState>) {
    const state = sanitizeState(newState);

    for (const userId of recipients) {
      const record = this.members.get(userId);
      if (!record) continue;

      record.state = state;
      this.members.set(userId, record);
      await this.ctx.storage.put(`m:${userId}`, record);

      for (const conn of this.getConnections<ConnState>()) {
        if (conn.state?.role === "member" && conn.state.userId === userId) {
          conn.send(this.encode("state.member", state));
        }
      }
    }
  }

  // Build the `state.host` roster: every member who has ever joined, with
  // online derived from live connections. Matches the legacy `updateHostState`
  // payload shape (id, name, online, metadata, twitchData).
  private sendStateToHosts() {
    const onlineUserIds = new Set<string>();
    for (const conn of this.getConnections<ConnState>()) {
      if (conn.state?.role === "member") onlineUserIds.add(conn.state.userId);
    }

    const members: Record<string, unknown> = {};
    for (const record of this.members.values()) {
      const metadata = record.metadata || {};
      members[record.userId] = {
        id: record.userId,
        name: record.userName,
        online: onlineUserIds.has(record.userId),
        metadata,
        twitchData: metadata.twitch,
      };
    }

    this.sendToHosts(this.encode("state.host", { members }));
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------
  async onAlarm() {
    if (this.settings?.persistent) return; // shouldn't be scheduled, belt-and-suspenders

    // TTL reached: evict the room. Wiping settings makes the room read as
    // non-existent to future connects (the cleanup cron's DELETE, per-room).
    for (const conn of this.getConnections<ConnState>()) {
      this.fail(conn, "This room has expired.");
    }
    await this.recordRoomEnded("expired");
    await this.ctx.storage.deleteAll();
    this.settings = null;
    this.members.clear();
  }

  // -------------------------------------------------------------------------
  // Permanent history (D1) + admin monitoring
  // -------------------------------------------------------------------------
  // Record the room in the permanent D1 history on creation. Best-effort: a
  // failed write just means the room isn't recorded; it doesn't break the room.
  private async recordRoomCreated(s: RoomSettings) {
    try {
      await this.env.DB.prepare(
        `INSERT INTO rooms (id, code, host_id, twitch_required, persistent, closed, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          s.id,
          this.name,
          s.hostId,
          s.twitchRequired ? 1 : 0,
          s.persistent ? 1 : 0,
          s.closed ? 1 : 0,
          s.createdAt,
        )
        .run();
    } catch (e) {
      console.error(`[relay ${this.name}] D1 room insert failed`, e);
    }
  }

  // Stamp the room's end in D1 (the row is kept forever — history is permanent).
  private async recordRoomEnded(reason: string) {
    const id = this.settings?.id;
    if (!id) return;
    try {
      await this.env.DB.prepare(
        `UPDATE rooms SET ended_at = ?, end_reason = ? WHERE id = ? AND ended_at IS NULL`,
      )
        .bind(Date.now(), reason, id)
        .run();
    } catch (e) {
      console.error(`[relay ${this.name}] D1 room end failed`, e);
    }
  }

  // Rich, live snapshot of this room for the admin monitor: settings + lifetime
  // + presence (host connected, member roster with online status).
  private adminStatus(): Response {
    const onlineUserIds = new Set<string>();
    for (const conn of this.getConnections<ConnState>()) {
      if (conn.state?.role === "member") onlineUserIds.add(conn.state.userId);
    }

    const members = [...this.members.values()].map((r) => ({
      userId: r.userId,
      userName: r.userName,
      online: onlineUserIds.has(r.userId),
      twitch: r.metadata?.twitch?.username ?? null,
    }));

    const settings = this.settings;
    return Response.json({
      exists: settings !== null,
      code: this.name,
      hostId: settings?.hostId ?? null,
      twitchRequired: settings?.twitchRequired ?? false,
      persistent: settings?.persistent ?? false,
      closed: settings?.closed ?? false,
      createdAt: settings?.createdAt ?? null,
      expiresAt: settings && !settings.persistent ? settings.createdAt + ROOM_TTL_MS : null,
      hasHost: this.findHostConnection() !== null,
      memberCount: members.length,
      onlineCount: members.filter((m) => m.online).length,
      members,
    });
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  private encode(type: string, payload?: unknown): string {
    return JSON.stringify({ type, payload } satisfies Envelope);
  }

  private fail(connection: Connection<ConnState>, message: string) {
    connection.send(this.encode("error", { message }));
    connection.close(FATAL_CLOSE, message);
  }

  private findHostConnection(): Connection<ConnState> | null {
    for (const conn of this.getConnections<ConnState>()) {
      if (conn.state?.role === "host") return conn;
    }
    return null;
  }

  private sendToHosts(message: string) {
    for (const conn of this.getConnections<ConnState>()) {
      if (conn.state?.role === "host") conn.send(message);
    }
  }

  private broadcastToMembers(message: string) {
    for (const conn of this.getConnections<ConnState>()) {
      if (conn.state?.role === "member") conn.send(message);
    }
  }
}
