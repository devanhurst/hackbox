import PartySocket from "partysocket";

// @hackbox/client — the connection SDK for hackbox hosts and players.
//
// It wraps a raw-WebSocket `partysocket` connection to the hackbox relay and
// re-exposes the *exact* event surface the legacy socket.io API had, so
// existing integrations migrate by swapping their connection import — not their
// logic. The application protocol (event names + payloads documented at
// app.hackbox.ca/docs) is unchanged; only the transport moved from
// socket.io/engine.io to raw WebSocket (the relay is a Cloudflare Durable
// Object, which speaks raw WS).
//
//   Host   : on("state.host"|"msg"|"change"), emit("member.update"|"reload")
//   Player : on("state.member"|"reload"|"error"|"disconnect"), emit("msg"|"change")
//
// Identity is derived server-side from `userId`: connect with `userId` equal to
// the room's hostId to be the host, anything else to be a player.

// Keepalive ping interval. Browsers never send WebSocket pings on their own and
// partysocket has no built-in heartbeat, so an idle socket can be silently
// dropped by consumer-router / CGNAT idle timeouts (observed as code 1006
// ~60-90s after connect). A periodic client->server frame keeps the NAT mapping
// warm; the relay answers it at the edge via setWebSocketAutoResponse, so the
// Durable Object stays hibernated. Must match the relay's auto-response string.
const PING_INTERVAL_MS = 25_000;
const KEEPALIVE_PING = "ping";

// WebSocket.OPEN, hard-coded so the SDK doesn't depend on a global `WebSocket`
// (third-party hosts may run under Node, where partysocket polyfills the
// transport but `WebSocket` isn't necessarily global).
const WS_OPEN = 1;

// Close codes >= 4000 are deliberate server rejections (room gone, room closed,
// Twitch required, duplicate device, room expired). They must NOT trigger a
// reconnect — the relay sends a human-readable `error` frame first, then closes
// with one of these.
const FATAL_CLOSE_THRESHOLD = 4000;

// Reasons the legacy client treats as transient (reconnect, stay put) rather
// than terminal (navigate home). Preserved so existing `on("disconnect")`
// handlers behave identically.
const RECONNECT_REASONS = new Set(["ping timeout", "transport close", "transport error"]);

export interface HackboxSocketOptions {
  /** Relay host, e.g. "app.hackbox.ca" (prod) or "localhost:1999" (dev). */
  host: string;
  /** 4-character room code. */
  roomCode: string;
  /** Connect as the host by passing the room's hostId here; any other id joins as a player. */
  userId: string;
  /** Display name (players only; ignored for the host). */
  userName?: string;
  /** Arbitrary handshake metadata, e.g. `{ twitchAccessToken }`. */
  metadata?: Record<string, unknown>;
  /** partyserver party name. Defaults to "main"; you should not need to change this. */
  party?: string;
}

type Listener = (payload: unknown) => void;

export interface HackboxSocket {
  /** Subscribe to an event. Returns an unsubscribe function. */
  on(event: string, cb: Listener): () => void;
  /** Unsubscribe a previously-registered listener. */
  off(event: string, cb: Listener): void;
  /** Send an event to the relay (`member.update`, `reload`, `msg`, `change`). */
  emit(event: string, payload?: unknown): void;
  /** Permanently close the connection (no reconnect). */
  close(): void;
  /** Whether the underlying socket is currently open. */
  readonly connected: boolean;
  /** Escape hatch to the underlying partysocket. */
  readonly raw: PartySocket;
}

export function createHackboxSocket(options: HackboxSocketOptions): HackboxSocket {
  const listeners = new Map<string, Set<Listener>>();

  const emitLocal = (event: string, payload?: unknown) => {
    const set = listeners.get(event);
    if (!set) return;
    for (const cb of [...set]) {
      try {
        cb(payload);
      } catch (err) {
        console.error(`[hackbox] listener for "${event}" threw`, err);
      }
    }
  };

  const socket = new PartySocket({
    host: options.host,
    room: options.roomCode.toUpperCase(),
    party: options.party ?? "main",
    query: {
      userId: options.userId,
      userName: options.userName ?? "",
      metadata: JSON.stringify(options.metadata ?? {}),
    },
    minReconnectionDelay: 250,
    maxReconnectionDelay: 1000,
    reconnectionDelayGrowFactor: 2,
  });

  // Set once a fatal close arrives (or close() is called) so the transport
  // "error"/"close" handlers don't keep re-emitting after we've given up.
  let fatal = false;

  // Run the keepalive only while open. Starting on every "open" (incl.
  // reconnects) and clearing on every "close" means a permanent close() leaves
  // no timer behind.
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  const stopPing = () => {
    if (pingTimer !== null) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
  };

  socket.addEventListener("open", () => {
    stopPing();
    pingTimer = setInterval(() => {
      if (socket.readyState === WS_OPEN) socket.send(KEEPALIVE_PING);
    }, PING_INTERVAL_MS);
  });

  socket.addEventListener("message", (event: MessageEvent) => {
    if (typeof event.data !== "string") return;
    // The relay's auto-response to our keepalive; nothing to dispatch.
    if (event.data === "pong") return;

    let frame: { type?: unknown; payload?: unknown };
    try {
      frame = JSON.parse(event.data);
    } catch {
      return;
    }
    if (!frame || typeof frame.type !== "string") return;

    // The relay's application-level `error` frame ({ message }) maps onto the
    // legacy `error` event; a fatal close follows it.
    emitLocal(frame.type, frame.payload);
  });

  socket.addEventListener("close", (event: CloseEvent) => {
    stopPing();

    if (event.code >= FATAL_CLOSE_THRESHOLD) {
      fatal = true;
      // Halt partysocket's automatic reconnect — the server doesn't want us.
      socket.close();
      // A reason outside RECONNECT_REASONS signals "terminal" to the client.
      emitLocal("disconnect", event.reason || "io server disconnect");
      return;
    }

    if (fatal) return;
    // Transient drop; partysocket will reconnect. Mirrors socket.io emitting
    // "disconnect" with a transport reason before reconnecting.
    emitLocal("disconnect", "transport close");
  });

  socket.addEventListener("error", () => {
    if (fatal) return;
    emitLocal("disconnect", "transport error");
  });

  return {
    on(event, cb) {
      let set = listeners.get(event);
      if (!set) {
        set = new Set();
        listeners.set(event, set);
      }
      set.add(cb);
      return () => set.delete(cb);
    },
    off(event, cb) {
      listeners.get(event)?.delete(cb);
    },
    emit(event, payload) {
      socket.send(JSON.stringify({ type: event, payload }));
    },
    close() {
      fatal = true;
      stopPing();
      socket.close();
    },
    get connected() {
      return socket.readyState === WS_OPEN;
    },
    raw: socket,
  };
}

export { RECONNECT_REASONS };
