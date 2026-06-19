import PartySocket from "partysocket";

// The playground's connection to the hackbox relay.
//
// The playground acts as a HOST: it creates a room and pushes member state to
// connected players. It speaks the relay's raw-WebSocket `{ type, payload }`
// protocol directly, re-exposing the same `on`/`emit` surface the old socket.io
// host used so the rest of the playground was unaffected by the transport move.
//
//   Host: on("state.host"), emit("member.update"|"reload")
//
// This is a trimmed copy of the player client's connector
// (client/src/lib/sockets/hackboxSocket.ts) — the codebase deliberately has no
// shared JS package (hackbox hosts are Unity, not JS), so the docs playground
// keeps its own copy. Keep the two in sync if the wire protocol changes.

// Keepalive ping interval. Browsers never send WebSocket pings on their own and
// partysocket has no built-in heartbeat, so an idle socket can be silently
// dropped by consumer-router / CGNAT idle timeouts. A periodic client->server
// frame keeps the NAT mapping warm; the relay answers it at the edge via
// setWebSocketAutoResponse. Must match the relay's auto-response string.
const PING_INTERVAL_MS = 25_000;
const KEEPALIVE_PING = "ping";

const WS_OPEN = 1; // WebSocket.OPEN

// The relay is served at <host>/r/<code> — a single static path prefix on the
// apex. Must match the relay Worker's router.
const RELAY_PATH_PREFIX = "r";

// Close codes >= 4000 are deliberate server rejections (room gone, room closed,
// duplicate device, room expired). They must NOT trigger a reconnect — the relay
// sends a human-readable `error` frame first, then closes with one of these.
const FATAL_CLOSE_THRESHOLD = 4000;

export interface HackboxSocketOptions {
  /** Relay host, e.g. "hackbox.ca" (prod) or "localhost:1999" (dev). */
  host: string;
  /** 4-character room code. */
  roomCode: string;
  /** Connect as the host by passing the room's hostId here. */
  userId: string;
}

type Listener = (payload: unknown) => void;

export interface HackboxSocket {
  /** Subscribe to an event. Returns an unsubscribe function. */
  on(event: string, cb: Listener): () => void;
  /** Unsubscribe a previously-registered listener. */
  off(event: string, cb: Listener): void;
  /** Send an event to the relay (`member.update`, `reload`). */
  emit(event: string, payload?: unknown): void;
  /** Permanently close the connection (no reconnect). */
  close(): void;
  /** Whether the underlying socket is currently open. */
  readonly connected: boolean;
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

  const roomCode = options.roomCode.toUpperCase();
  const socket = new PartySocket({
    host: options.host,
    room: roomCode,
    // basePath overrides partysocket's default `<prefix>/<party>/<room>` URL,
    // giving the minimal `wss://<host>/r/<code>`.
    basePath: `${RELAY_PATH_PREFIX}/${roomCode}`,
    query: {
      userId: options.userId,
    },
    minReconnectionDelay: 250,
    maxReconnectionDelay: 1000,
    reconnectionDelayGrowFactor: 2,
  });

  // Set once a fatal close arrives (or close() is called) so the transport
  // handlers don't keep re-emitting after we've given up.
  let fatal = false;

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

    emitLocal(frame.type, frame.payload);
  });

  socket.addEventListener("close", (event: CloseEvent) => {
    stopPing();

    if (event.code >= FATAL_CLOSE_THRESHOLD) {
      fatal = true;
      socket.close();
      emitLocal("disconnect", event.reason || "server disconnect");
      return;
    }

    if (fatal) return;
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
  };
}
