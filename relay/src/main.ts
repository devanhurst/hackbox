import { Server, type Connection, type ConnectionContext } from "partyserver";
import { MessageLog } from "./messageLog";
import { defaultMemberState, sanitizeState, stripNullBytes, type MemberState } from "./roomState";
import { authenticateWithTwitch, type TwitchMetadata } from "./twitch";

// Wire protocol — every WebSocket frame is a JSON envelope `{ type, payload }`:
//
//   host -> relay : member.update { to, data }, reload
//   relay -> host : state.host { members }, msg { ... }, change { ... }
//   member -> relay: msg { event, value }, change { event, value }
//   relay -> member: state.member <MemberState>, reload, error { message }
//
// The relay is otherwise a dumb router. Its one stateful job is the *replay
// cache*: it remembers the last state addressed to each member and replays it on
// (re)connect.

interface Envelope {
  type: string;
  payload?: unknown;
}

// Lives in the connection's hibernatable state, so it survives the DO being
// evicted from memory between messages.
interface ConnState {
  role: "host" | "member";
  userId: string;
  userName: string;
}

// Persisted under the "settings" key. A room "exists" iff this record is present.
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

// Persisted under `m:${userId}`. The relay's replay cache + presence roster
// source. `online` is *not* stored — it is derived from whether a live
// connection for the userId currently exists.
interface MemberRecord {
  userId: string;
  userName: string;
  metadata: MemberMetadata;
  state: MemberState;
}

// The client SDK treats close code >= 4000 as fatal: stop reconnecting and
// surface the preceding `error` message.
const FATAL_CLOSE = 4000;

// Rooms self-destruct 24h after creation unless persistent.
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
  DB: D1Database;
}

export class Room extends Server<Env> {
  // WebSocket Hibernation: the DO is evicted from memory between messages, so an
  // idle room costs nothing. Durable state lives in storage + connection
  // attachments; in-memory caches are rehydrated in onStart().
  static options = { hibernate: true };

  private settings: RoomSettings | null = null;
  private members = new Map<string, MemberRecord>();
  // Constructed in onStart, once `this.name` (the room code) has been set by
  // getServerByName — it isn't available at field-init time.
  private log!: MessageLog;

  async onStart() {
    this.settings = (await this.ctx.storage.get<RoomSettings>("settings")) ?? null;

    const stored = await this.ctx.storage.list<MemberRecord>({ prefix: "m:" });
    this.members = new Map();
    for (const record of stored.values()) {
      this.members.set(record.userId, record);
    }

    this.log = new MessageLog(this.ctx, this.env.DB, this.name, () => this.settings?.id ?? null);
    await this.log.init();

    // Answer client keepalive pings at the edge without waking the DO from
    // hibernation. The client SDK sends "ping" on a ~25s interval to keep
    // NAT/middlebox idle timeouts from dropping otherwise silent sockets;
    // re-applied on every start so it survives eviction.
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async onRequest(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const url = new URL(req.url);

    // POST .../init — initialise the room. Returns 409 if the room already exists
    // so the caller can retry with a fresh code. A `restore` payload revives an
    // existing room *in place* instead of minting a new instance.
    if (req.method === "POST" && url.pathname.endsWith("/init")) {
      if (this.settings) {
        return Response.json(
          { ok: false, error: "exists" },
          { status: 409, headers: corsHeaders() },
        );
      }

      const body = (await req.json().catch(() => null)) as {
        hostId?: string;
        twitchRequired?: boolean;
        persistent?: boolean;
        closed?: boolean;
        createdAt?: number;
        restore?: boolean;
        id?: string;
        members?: { userId?: string; userName?: string; metadata?: MemberMetadata }[];
      } | null;

      if (!body?.hostId) {
        return Response.json(
          { ok: false, error: "hostId required" },
          { status: 400, headers: corsHeaders() },
        );
      }

      const isRestore = body.restore === true && typeof body.id === "string";

      const settings: RoomSettings = {
        // Restore reuses the room's existing history-row id; a fresh create mints one.
        id: isRestore ? body.id! : crypto.randomUUID(),
        hostId: body.hostId,
        twitchRequired: Boolean(body.twitchRequired),
        persistent: Boolean(body.persistent),
        closed: Boolean(body.closed),
        // A revived room starts a fresh session now; its original created_at is
        // preserved on the history row.
        createdAt: !isRestore && typeof body.createdAt === "number" ? body.createdAt : Date.now(),
      };
      this.settings = settings;
      await this.ctx.storage.put("settings", settings);
      if (!settings.persistent) {
        await this.ctx.storage.setAlarm(settings.createdAt + ROOM_TTL_MS);
      }

      if (isRestore) {
        await this.seedMembers(body.members ?? []);
        await this.recordRoomRevived(settings.id);
        await this.log.resumeFrom(settings.id);
      } else {
        await this.recordRoomCreated(settings);
      }

      return Response.json({ ok: true, roomCode: this.name }, { headers: corsHeaders() });
    }

    // The monitor's live tail (see messageLog.ts). Like the rest of /admin/*,
    // reachable only via the admin Worker's service binding, never the public
    // internet.
    if (
      req.method === "GET" &&
      url.pathname.startsWith("/admin/room/") &&
      url.pathname.endsWith("/messages")
    ) {
      const since = Number(url.searchParams.get("since") ?? "-1");
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? "200"), 1), 500);
      const { messages, nextSeq, oldestSeq } = await this.log.tail(
        Number.isFinite(since) ? since : -1,
        Number.isFinite(limit) ? limit : 200,
      );
      return Response.json(
        { messages, nextSeq, oldestSeq, live: this.settings !== null },
        { headers: corsHeaders({ "Cache-Control": "no-store" }) },
      );
    }

    if (req.method === "GET" && url.pathname.startsWith("/admin/room/")) {
      return this.adminStatus();
    }

    // The optional `id` guards against destroying a different instance that
    // happens to share the code.
    if (req.method === "DELETE" && url.pathname.startsWith("/admin/room/")) {
      return this.destroy(url.searchParams.get("id"));
    }

    if (req.method === "PATCH" && url.pathname.startsWith("/admin/room/")) {
      const patch = (await req.json().catch(() => null)) as {
        id?: string;
        twitchRequired?: boolean;
        persistent?: boolean;
        closed?: boolean;
      } | null;
      return this.updateSettings(patch);
    }

    // Existence + status probe. `isMember` lets the api Worker hide closed rooms
    // from non-members.
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

  // Identity is derived entirely from the handshake query params (userId,
  // userName, metadata) — there is no separate `identify` message.
  async onConnect(connection: Connection<ConnState>, ctx: ConnectionContext) {
    // Scrub NUL bytes from handshake values up front; everything downstream reads
    // from these.
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
      twitch: await authenticateWithTwitch(
        handshakeMetadata.twitchAccessToken,
        this.env.TWITCH_CLIENT_ID,
      ),
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

    // One live connection per user: kick any older device sharing this userId.
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
    if (!existing) await this.recordMemberJoined(record);

    connection.setState({ role: "member", userId, userName });

    // Replay the member's last-known UI so a reconnecting player lands back on
    // their current screen instead of a blank one.
    connection.send(this.encode("state.member", record.state));

    this.sendStateToHosts();
  }

  async onClose(connection: Connection<ConnState>) {
    // `online` is derived from live connections, so re-broadcasting the roster
    // after a disconnect flips the right member to offline.
    if (connection.state?.role === "member") {
      this.sendStateToHosts();
    }
  }

  onMessage(sender: Connection<ConnState>, message: string | ArrayBuffer | ArrayBufferView) {
    if (typeof message !== "string") return;
    // Keepalive pings are handled by setWebSocketAutoResponse; guard against
    // stray "ping" strings from older clients anyway.
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
      const { to, data } = (envelope.payload ?? {}) as {
        to?: string | string[];
        data?: Partial<MemberState>;
      };
      if (to === undefined || data === undefined) return;
      void this.updateMemberStates([to].flat(), data);
      return;
    }

    if (envelope.type === "reload") {
      this.broadcastToMembers(this.encode("reload"));
    }
  }

  private handleMemberMessage(sender: Connection<ConnState>, state: ConnState, envelope: Envelope) {
    // `msg` (submitted) and `change` (work-in-progress) share a shape.
    if (envelope.type !== "msg" && envelope.type !== "change") return;

    const payload = envelope.payload as { event?: string; value?: unknown } | undefined;
    if (!payload) return;

    const timestamp = Date.now();
    this.sendToHosts(
      this.encode(envelope.type, {
        from: state.userId,
        event: payload.event,
        message: payload,
        timestamp,
      }),
    );

    this.log.append({
      direction: "member_to_host",
      type: envelope.type,
      from: state.userId,
      to: null,
      event: payload.event ?? null,
      payload,
      timestamp,
    });
  }

  // Sanitize, cache for replay, and push to any live connection. Only recipients
  // with an existing member record are updated.
  private async updateMemberStates(recipients: string[], newState: Partial<MemberState>) {
    const state = sanitizeState(newState);
    const timestamp = Date.now();

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

      this.log.append({
        direction: "host_to_member",
        type: "state.member",
        from: null,
        to: userId,
        event: null,
        payload: state,
        timestamp,
      });
    }
  }

  // The `state.host` roster: every member who has ever joined, with online
  // derived from live connections.
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

  async onAlarm() {
    if (this.settings?.persistent) return; // shouldn't be scheduled, belt-and-suspenders

    // TTL reached: evict the room. Wiping settings makes it read as non-existent
    // to future connects.
    for (const conn of this.getConnections<ConnState>()) {
      this.fail(conn, "This room has expired.");
    }
    await this.recordRoomEnded("expired");
    // Flush unflushed monitor log to D1 before storage is wiped.
    await this.log.flush();
    await this.ctx.storage.deleteAll();
    this.settings = null;
    this.members.clear();
  }

  // Best-effort: a failed write just means the room isn't recorded; it doesn't
  // break the room.
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

  // Restores identity only; per-member UI state is left at the default — the
  // host re-drives each screen on reconnect (it is authoritative), and live UI
  // state is never persisted to D1 (heavy write amplification during gameplay).
  private async seedMembers(
    seed: { userId?: string; userName?: string; metadata?: MemberMetadata }[],
  ) {
    for (const m of seed) {
      if (!m.userId) continue;
      const userName = m.userName ?? "";
      const record: MemberRecord = {
        userId: m.userId,
        userName: userName.toUpperCase(),
        metadata: m.metadata ?? {},
        state: sanitizeState(defaultMemberState(userName)),
      };
      this.members.set(m.userId, record);
      await this.ctx.storage.put(`m:${m.userId}`, record);
    }
  }

  // Wipes DO storage + the expiry alarm so the code is free for reuse. Guarded by
  // `id` so we don't destroy a different live instance that shares the code.
  private async destroy(expectedId: string | null): Promise<Response> {
    if (!this.settings) {
      return Response.json({ destroyed: false, reason: "not live" }, { headers: corsHeaders() });
    }
    if (expectedId && this.settings.id !== expectedId) {
      return Response.json(
        { destroyed: false, reason: "different instance" },
        { headers: corsHeaders() },
      );
    }
    for (const conn of this.getConnections<ConnState>()) {
      this.fail(conn, "This room has been deleted.");
    }
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    this.settings = null;
    this.members.clear();
    return Response.json({ destroyed: true }, { headers: corsHeaders() });
  }

  private async recordRoomRevived(id: string) {
    try {
      await this.env.DB.prepare(`UPDATE rooms SET ended_at = NULL, end_reason = NULL WHERE id = ?`)
        .bind(id)
        .run();
    } catch (e) {
      console.error(`[relay ${this.name}] D1 room revive failed`, e);
    }
  }

  private async recordMemberJoined(record: MemberRecord) {
    const settings = this.settings;
    if (!settings) return;
    try {
      await this.env.DB.prepare(
        `INSERT INTO members (id, room_id, room_code, user_id, user_name, created_at, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          crypto.randomUUID(),
          settings.id,
          this.name,
          record.userId,
          record.userName,
          Date.now(),
          record.metadata ? JSON.stringify(record.metadata) : null,
        )
        .run();
    } catch (e) {
      console.error(`[relay ${this.name}] D1 member insert failed`, e);
    }
  }

  // Stamps ended_at; the row itself is kept forever (history is permanent).
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

  private async adminStatus(): Promise<Response> {
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
      // The actual scheduled DO alarm (null = none, i.e. persistent or expired).
      expiresAt: await this.ctx.storage.getAlarm(),
      hasHost: this.findHostConnection() !== null,
      memberCount: members.length,
      onlineCount: members.filter((m) => m.online).length,
      members,
    });
  }

  // Reconciles the expiry alarm: persistent rooms drop their alarm; rooms made
  // ephemeral get a fresh 24h alarm if they don't already have one. Guarded by
  // `id` so we don't edit a different instance sharing the code.
  private async updateSettings(
    body: { id?: string; twitchRequired?: boolean; persistent?: boolean; closed?: boolean } | null,
  ): Promise<Response> {
    if (!this.settings) {
      return Response.json({ updated: false, reason: "not live" }, { headers: corsHeaders() });
    }
    if (body?.id && this.settings.id !== body.id) {
      return Response.json(
        { updated: false, reason: "different instance" },
        { headers: corsHeaders() },
      );
    }

    if (typeof body?.twitchRequired === "boolean")
      this.settings.twitchRequired = body.twitchRequired;
    if (typeof body?.closed === "boolean") this.settings.closed = body.closed;
    if (typeof body?.persistent === "boolean") this.settings.persistent = body.persistent;
    await this.ctx.storage.put("settings", this.settings);

    if (this.settings.persistent) {
      await this.ctx.storage.deleteAlarm();
    } else if ((await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS);
    }

    return Response.json(
      { updated: true, alarm: await this.ctx.storage.getAlarm() },
      { headers: corsHeaders() },
    );
  }

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
