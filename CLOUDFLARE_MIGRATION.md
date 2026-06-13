# Hackbox → Cloudflare migration

Migrating hackbox off its persistent Node/Express/Socket.io + Postgres service
(currently on Render) onto the same fully-Cloudflare architecture as jparty:
Durable Objects for real-time sync, a static-assets Worker for the SPA, and —
only if needed — a Hono Worker for HTTP. The goal is effectively infinite
horizontal scale with no always-on server and no managed database.

## Verdict: feasible, and a cleaner fit than jparty in places

Hackbox's `RoomService` is already **one instance per room**, holding that
room's sockets and reading/writing only that room's rows. That is exactly the
shape of a Durable Object — the migration is less a re-architecture than a
relocation of `RoomService` into a `Room` DO.

It is also *simpler* than the jparty relay:

- **Host identity is a shared secret** (`userId === room.hostId`), so there is
  no need for jparty's multi-tab host-challenge nonce protocol.
- **The 24h cleanup cron becomes a DO alarm** — no external scheduler.
- **No database at all.** Live member state lives in DO storage; rooms are
  ephemeral (≤24h), so there is nothing to back up or migrate.

## The one real complication: hackbox's transport is a public API

jparty owned both ends of its wire, so it swapped socket.io for `partysocket`
freely. Hackbox **cannot**: the host is not in this repo. It is a third-party
integration against a documented public API
(`docs/content/1.docs/1.getting-started.md`):

```
POST  https://app.hackbox.ca/rooms
wss://app.hackbox.ca/socket.io?roomCode=HKBX&userId=<hostId>
```

Durable Objects speak **raw WebSocket**, not the socket.io/engine.io protocol.
So moving to Cloudflare is necessarily a **transport-level breaking change** for
any host/player using the socket.io client library.

The mitigation: the break is only at the *transport* layer. The **application
protocol** — the event names and payloads (`member.update`, `reload`, `msg`,
`change`, `state.host`, `state.member`) — is preserved byte-for-byte. A thin
`@hackbox/client` SDK wraps `partysocket` and exposes the same
`emit(event, payload)` / `on(event, cb)` surface, so third-party host code
changes one line (the connection import), not its logic.

## Locked decisions

1. **No socket.io compatibility shim.** Clean break to raw WebSocket via the
   `@hackbox/client` SDK that preserves the event-level protocol.
2. **DO-only. No D1.** Room codes are allocated by probing the target DO for
   existence and retrying on collision; live state lives in DO storage. No
   relational database is introduced.
3. **Dumb relay + replay cache.** The host stays authoritative for all game
   state (it always was — the legacy server only *cached* each member's last
   state for reconnect replay). The relay is a generic message router whose only
   stateful job is replaying each member's last-known state on reconnect.

## Target architecture

Two Workers (the admin panel referenced in `CLAUDE.md` does not exist in the
repo, so there is nothing to migrate there):

| Worker | Role | jparty analog |
| --- | --- | --- |
| `hackbox-relay` (partyserver) | Stateful `Room` DO — connections + per-room member state + replay cache + alarm cleanup | `relay/` (but stateful) |
| `hackbox-api` (Hono) | `POST /rooms` (allocate unique code, init DO), `GET /rooms/:code` | `api/` |
| `hackbox-client` (static assets) | Serves the Vue SPA | `client/worker/index.js` |

`POST /rooms` lives in the api Worker (Hono) rather than the relay because the
relay's path is reserved for room sockets; the api Worker generates a code,
calls the room's DO `POST /r/<code>/init`, and retries on a `409` collision.

### Routing: path prefixes on the apex, not subdomains

All three Workers are served under the apex `hackbox.ca` via path prefixes
rather than `api.`/`relay.` subdomains. Subdomains get reset by some users'
wifi/CGNAT middleboxes that SNI-filter, while the apex passes — the same fix
jparty adopted. A path prefix is the minimum a Worker needs to be routable
(Cloudflare routes by path, not by the WebSocket `Upgrade` header, and the apex
itself is the SPA), so the relay can't be path-less — but it is kept minimal at
one static segment. Rather than partyserver's default three-segment
`/parties/:party/:room`, the relay Worker routes `/r/<code>` by hand (via
`getServerByName`) and the SDK points `partysocket` there with `basePath`:

- `hackbox.ca/r/*` → `hackbox-relay` (WS at the minimal `wss://hackbox.ca/r/<code>`)
- `hackbox.ca/api/*` → `hackbox-api` (`POST /api/rooms`, `GET /api/rooms/:code`)
- `hackbox.ca/*` → `hackbox-client` (SPA; the two prefixes above are more specific
  and take precedence)

### Wire protocol

Every frame is a JSON envelope `{ type, payload }`. The SDK maps it 1:1 onto the
legacy socket.io API (`emit(type, payload)` ⇄ `{ type, payload }`;
`on(type, cb)` ⇄ `cb(payload)`):

```
host   -> relay : member.update { to, data }, reload
relay  -> host  : state.host { members }, msg { from, event, message, timestamp }, change { ... }
member -> relay : msg { event, value }, change { event, value }
relay  -> member: state.member <MemberState>, reload, error { message }
```

## Component-by-component mapping

| Legacy | Blocker on Workers | Cloudflare target |
| --- | --- | --- |
| Express + `node:http` (`server/index.ts`) | No Node HTTP in Workers | Hono Worker + DO `fetch` |
| socket.io **server** | Protocol unsupported on DO | partyserver raw WS |
| socket.io-client + 3rd-party hosts | engine.io transport | `partysocket` via `@hackbox/client` SDK |
| `RoomService` (instance per room) | — already room-scoped | `Room` DO (1:1) |
| `members.state/online/metadata` via `pg` | TCP driver banned | DO storage + connection-derived presence |
| `Room.create` / `generateRoomCode` | — | api Worker + DO `init` (probe-and-retry) |
| `cleanup-old-rooms.ts` cron | external scheduler | DO **alarm** self-destruct |
| `authenticateWithTwitch` (`lib/twitch.ts`) | none — pure `fetch` | ported into the DO, reads `env.TWITCH_CLIENT_ID` |
| `@sentry/node` + profiling | Node-only | `@sentry/cloudflare` (optional) |
| Render deploy | — | `wrangler deploy` ×2–3 |

## Status

### Done — `relay/` Durable Object Worker

The `Room` DO ports `RoomService` + `hostSocket` + `memberSocket` into a single
hibernatable Durable Object, preserving the exact event contract.

- `relay/src/main.ts` — the `Room` DO: identity by `userId === hostId`,
  `member.update`/`reload`/`msg`/`change` routing, `state.host` roster,
  `state.member` targeted delivery, replay cache in DO storage, one-device-per-
  user eviction, room settings (closed / twitchRequired / persistent), 24h
  self-destruct alarm, edge-level keepalive auto-response.
- `relay/src/roomState.ts` — `MemberState` + `sanitizeState`/`defaultMemberState`
  ported verbatim (in behaviour) from `server/helpers.ts`.
- `relay/src/twitch.ts` — `authenticateWithTwitch`, sourcing the client id from
  the Worker `env` binding.
- `relay/src/index.ts`, `relay/wrangler.toml`, `relay/package.json`,
  `relay/tsconfig.json` — Worker entry + config. `tsc --noEmit` passes.

Storage layout: `settings` (room metadata; a room "exists" iff present) and
`m:${userId}` (per-member replay record). `online` is derived from live
connections, never stored.

### Done — `api/` Hono Worker

The HTTP front door, ported from the legacy Express `server/api.ts`, preserving
the public contract:

- `api/src/index.ts` — `POST /rooms` → `{ ok, roomCode }`,
  `GET /rooms/:roomCode` → `{ exists, twitchRequired }` (closed rooms hidden from
  non-members), `GET /healthcheck` → `{ ok: true }`. Permissive CORS (`origin: *`).
- `api/src/relay.ts` — `generateRoomCode` (ported verbatim) + a `RelayClient`
  that talks to the relay over a **service binding**, hitting
  `/r/<code>/init` (allocate, retry on `409` collision) and
  `/r/<code>` (existence/membership probe).
- `api/wrangler.toml` (service binding `RELAY` → `hackbox-relay`),
  `api/package.json`, `api/tsconfig.json`. `tsc --noEmit` passes.

Room codes are allocated entirely in the api Worker: generate a code, ask the
relay DO to `init`; a `409` means taken, so retry (up to 8 attempts). No shared
registry, no D1 — the DO's own existence is the source of truth.

### Done — `@hackbox/client` SDK

The connection SDK both the hackbox client and third-party hosts use. It wraps a
`partysocket` raw-WebSocket connection and re-exposes the **exact** legacy
socket.io event surface, so integrators migrate by swapping their connection
import, not their logic.

- `sdk/src/index.ts` — `createHackboxSocket({ host, roomCode, userId, userName?,
  metadata? })` → `{ on, off, emit, close, connected, raw }`. Frames are the
  `{ type, payload }` envelope; `on(type, cb)` ⇄ `cb(payload)`,
  `emit(type, payload)` ⇄ send. Includes the 25s keepalive ping (matching the
  relay's edge auto-response), fatal-close handling (≥4000 → stop reconnecting,
  surface the preceding `error`, emit a terminal `disconnect`), and the legacy
  transient-reason set so existing `on("disconnect")` handlers behave the same.
- `sdk/package.json` (`@hackbox/client`, `partysocket` dep, `tsc` build →
  ESM + d.ts), `sdk/tsconfig.json`, `sdk/README.md` (host/player usage + a
  socket.io migration table). `tsc` builds and type-checks clean.

### Done — client cutover + static-assets Worker

The Vue client now talks to the new backend through the SDK, and ships as a
Cloudflare static-assets Worker.

- `client/src/lib/sockets/playerSocket.ts` — rewritten onto `createHackboxSocket`
  (was `socket.io-client`). Event handlers (`state.member`, `reload`, `error`,
  `disconnect`) are unchanged; the SDK preserves the transient-vs-terminal
  disconnect semantics.
- `client/src/components/*.vue` (6 socket consumers) — inject type swapped from
  socket.io's `Socket` to `HackboxSocket`; `.emit(...)` calls unchanged.
- `client/src/config/index.ts` — `serverUrl` split into `apiUrl`
  (`…/api`) and `relayHost` (apex host for the WS). `getRoom.ts` uses `apiUrl`.
- `client/package.json` — drops `socket.io-client`, adds `@hackbox/client`
  (`file:../sdk`).
- `client/worker/index.js` + `client/wrangler.toml` — static-assets Worker
  serving Vite's `dist/` with SPA fallback (and a 404 guard for stale hashed
  chunks). `vue-tsc` type-checks and `vite build` succeeds with the SDK bundled.

### Remaining

1. **Cutover & deprecation** — stand up the Workers, point `hackbox.ca` DNS at
   the client Worker and add the `hackbox.ca/api/*` + `hackbox.ca/r/*`
   routes, update the public docs with the SDK + a transport-migration note, run
   the old Render service read-only during a deprecation window, then
   decommission Render + Postgres.

## Convergence with jparty

The replay cache is the only thing the hackbox relay adds over jparty's. It is
generic — "remember the last state addressed to each recipient, replay on
reconnect" — and would be a sound addition to the jparty relay too. The
remaining hackbox-specific logic (the `state.host` roster, targeted
`member.update`, server-side Twitch auth) exists only to keep the third-party
host API stable; it could move client-side if hackbox ever owned its hosts, at
which point the two relays would be essentially identical.

## Risks / open items

- **Third-party breakage** is the only sharp edge — mitigated by the SDK, but it
  is a versioned public-API change. How long the deprecation window needs to be
  depends on how many external hosts exist in the wild.
- **No socket.io polling fallback** on raw WS. Fine for modern clients on
  Cloudflare's edge; worth noting for very restrictive networks.
- **Async Twitch auth in `onConnect`** runs before the connection is marked
  identified; `onMessage` ignores frames until identity is set, so ordering is
  safe.
- **Sentry** loses Node profiling; error tracking via `@sentry/cloudflare` is
  the like-for-like replacement if desired.
