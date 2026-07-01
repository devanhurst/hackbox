# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Hackbox is a real-time multiplayer game platform (think Jackbox): a **host** (a
third-party game, typically a Unity build, not in this repo) drives UI onto
**players'** phones and receives their interactions, all relayed in real time.

The platform runs **entirely on Cloudflare** — Durable Objects for real-time
sync, D1 for durable history, and several Workers. There is no always-on server
and (for the live path) no managed database.

> **History:** Hackbox was migrated off a Node/Express/Socket.io + Postgres
> service (on Render) onto Cloudflare. The legacy service still lives in
> `server/` and is kept running only during the host-deprecation window — see
> [Legacy server](#legacy-server-server--deprecated). New work goes in the
> Cloudflare Workers below.

## Monorepo layout

| Dir | Worker | What it is |
| --- | --- | --- |
| `relay/` | `hackbox-relay` | The realtime core: a `Room` **Durable Object** (partyserver) holding live member state + a replay cache, and writing permanent history to D1. |
| `api/` | `hackbox-api` | A **Hono** Worker — the HTTP front door (`POST /api/rooms`, room existence probes). |
| `client/` | `hackbox-client` | The Vue 3 player SPA, served as a static-assets Worker. |
| `admin/` | `hackbox-admin` | A Nuxt 3 admin dashboard (Access-protected) reading room/member history from D1 + live presence from the relay. |
| `db/` | — | The Cloudflare **D1** schema (`schema.sql`) — permanent room/member history. |
| `docs/` | — | The public docs site (Nuxt Content, hackbox.ca/docs). Source under `docs/content/`. |
| `server/` | — | **Legacy** Node/Express/Socket.io + Postgres service. Deprecated. |

### Routing — apex path prefixes, not subdomains

All Workers are served under the apex `hackbox.ca` via path prefixes rather than
`api.`/`relay.` subdomains (subdomains get reset by some users' SNI-filtering
middleboxes; the apex is the durable fix). Order matters — more specific routes
win:

- `hackbox.ca/r/*` → relay (WS at the minimal `wss://hackbox.ca/r/<code>`)
- `hackbox.ca/api/*` → api (`POST /api/rooms`, `GET /api/rooms/:code`)
- `hackbox.ca/admin*` → admin (must stay behind **Cloudflare Access** — the Worker has no auth of its own)
- `hackbox.ca/docs*` → docs site
- `hackbox.ca` → client SPA (catch-all)

The relay and admin set `workers_dev = false` so their `*.workers.dev` URLs are
disabled; the relay's `/admin/*` surface is reachable **only** via service
bindings, never the public internet.

## The wire protocol (the public API)

Hosts are third-party integrations against a documented public API, so the
protocol is a hard contract — **don't break it casually.** Every WebSocket frame
is a JSON envelope `{ type, payload }` over raw WebSocket:

```
host   -> relay : member.update { to, data }, reload
relay  -> host  : state.host { members }, msg { from, event, message, timestamp }, change { ... }
member -> relay : msg { event, value }, change { event, value }
relay  -> member: state.member <MemberState>, reload, error { message }
```

- **Keepalive:** clients send a bare `ping` text frame every ~25s; the relay edge
  answers `pong` (it doesn't even wake the DO).
- **Terminal close:** a close code **≥ 4000** means "do not reconnect" (room
  gone/closed/expired, duplicate device); an `error` frame with a `message`
  precedes it. Codes < 4000 are transient — reconnect with backoff.
- **Identity** is by query param on connect: `userId === room.hostId` makes you
  the host (a shared secret); any other `userId` is a player.

The hackbox client SDK (`client/src/lib/sockets/hackboxSocket.ts`) maps this 1:1
onto a legacy socket.io-style surface (`emit(type, payload)` ⇄ `{ type, payload }`;
`on(type, cb)` ⇄ `cb(payload)`), so the rest of the client was unaffected by the
transport change. Unity hosts use the separate
[hackbox-unity](https://github.com/devanhurst/hackbox-unity) package.

## Architecture

### Relay (`relay/`) — the `Room` Durable Object

`relay/src/main.ts` is the `Room` DO (partyserver `Server`). It is otherwise a
**dumb message router**; its one stateful job is the **replay cache** — it
remembers the last `state.member` addressed to each member and replays it on
(re)connect (what the legacy `members.state` Postgres column did, now in DO
storage). Responsibilities:

- Host/member routing (`member.update`, `reload`, `msg`, `change`), the
  `state.host` roster, and targeted `state.member` delivery.
- One-connection-per-`userId` eviction; `online` is **derived** from live
  connections, never stored.
- Room settings (closed / twitchRequired / persistent) and a **24h self-destruct
  alarm**.
- Server-side **Twitch auth** (`relay/src/twitch.ts`, reads `env.TWITCH_CLIENT_ID`).
  `TWITCH_CLIENT_ID` is a **public** identifier (the Twitch app id, also exposed
  in the browser), so it lives as a plaintext **`[vars]` entry in
  `relay/wrangler.toml`** — *not* a `wrangler secret` or a dashboard variable.
  This is deliberate: `wrangler deploy` makes the Worker's vars exactly match
  `wrangler.toml` (`keep_vars` defaults to `false`), so a value set only in the
  dashboard gets wiped on the next deploy (which once silently broke every
  `twitchRequired` room). Keep it in `[vars]` and never re-add it as a dashboard
  var/secret. It must match the client's Twitch app (`VITE_TWITCH_CLIENT_ID`) or
  token validation 401s. Tests blank it via `relay/vitest.config.ts` to stay
  offline.
- **D1 history writes** (best-effort): a `rooms` row on creation, `ended_at` on
  expiry, a `members` row on each user's first join.

Other files: `relay/src/index.ts` (Worker entry — routes `/r/<code>` and
`/admin/room/<code>` by hand via `getServerByName`), `relay/src/roomState.ts`
(`MemberState`, `defaultMemberState`, `sanitizeState`).

Storage layout (DO): `settings` (room metadata — a room "exists" iff present)
and `m:${userId}` (per-member replay record). **Note:** the old `Registry` DO
was superseded by D1 history and has been **removed** (deleted via the `v3` DO
migration in `relay/wrangler.toml`). The `v1`/`v2` migration tags stay as
applied history — Cloudflare tracks migrations by tag, so past entries can't be
deleted.

### API (`api/`) — the HTTP front door

`api/src/index.ts` is a Hono app with `basePath("/api")`:

- `POST /api/rooms` `{ hostId, twitchRequired? }` → `{ ok, roomCode }`. Allocates
  a code by generating one and asking the relay DO to `init`; a `409` means the
  code is taken, so it retries (up to 8 attempts). **No shared registry, no D1
  for allocation** — the DO's own existence is the source of truth.
- `GET /api/rooms/:roomCode` → `{ exists, twitchRequired }` (closed rooms are
  hidden from non-members).
- `GET /api/healthcheck` → `{ ok: true }`.

It reaches the relay over a **service binding** (`RELAY`), not the public
internet (`api/src/relay.ts`: `RelayClient`, `generateRoomCode`).

### Client (`client/`) — the Vue player SPA

Vue 3 + Composition API + TypeScript + Vite. Unchanged from the legacy player
client except the transport. Key files:

- `src/lib/sockets/hackboxSocket.ts` — `createHackboxSocket(...)`, the
  `partysocket` wrapper that speaks the `{ type, payload }` envelope and exposes
  the `on`/`off`/`emit`/`close` surface (plus the 25s keepalive and ≥4000
  fatal-close handling).
- `src/lib/sockets/playerSocket.ts` — the reactive player connection, built on
  `createHackboxSocket`. Receives `state.member` and drives the UI.
- `src/lib/sockets/legacySocket.ts` — a `socket.io-client` fallback. The client
  probes the new relay first and falls back to the **legacy** server
  (`app.hackbox.ca`) for rooms hosted by not-yet-updated Unity games.
- `src/config/index.ts` — `apiUrl`, `relayHost`, `legacyServerUrl` (defaults to
  the current origin in prod; `VITE_*` env vars override).
- `src/views/PlayerView.vue` — the **dynamic component renderer**: reads
  `state.ui.main.components` and renders each by its `type` field.
- `src/components/` + `src/components/index.ts` — the player UI components
  (`ButtonComponent.vue`, `TextComponent.vue`, `Choices/`, `Sort/`, etc.).
- `src/types.ts` — `PlayerState`, `ThemeState`, `UiState`. No Vuex/Pinia; state
  is Vue's `reactive()`.

### Admin (`admin/`) — the monitor dashboard

Nuxt 3 SPA (`ssr: false`), deployed as a Cloudflare Worker via the Nitro
`cloudflare_module` preset, served under the `/admin` base path. The Nitro server
routes live in `admin/server/api/*`:

- `rooms.get.ts` — the room **listing** (permanent history from D1, newest first).
- `room/[id].get.ts` — a room's detail (roster).
- `rooms.post.ts` / `revive.post.ts` / `delete.post.ts` / `settings.post.ts` —
  create / import-existing / delete / edit rooms (via the relay service binding).

Data sources: **D1** (`DB` binding) for the durable listing, the **relay**
(`RELAY` service binding) for live presence (`/admin/room/<code>`). Shared
helpers in `admin/server/utils/rooms.ts`. `nitro-cloudflare-dev` wires the `DB`
and `RELAY` bindings into `nuxt dev`.

### Database (`db/`) — Cloudflare D1

A single D1 database, `hackbox`, holding **permanent room + member history only**
— live gameplay state stays in the relay's DOs. Schema in `db/schema.sql`:

- `rooms` — one row per room **instance**. Codes are recycled, so `id` (a UUID)
  is the primary key, **not** `code`. Rows are never deleted; a room's end is
  recorded via `ended_at` + `end_reason` (`expired` | `closed` | `migrated`).
- `members` — one row per (room instance, user) on first join (reconnects don't
  add rows); references `rooms.id` via `room_id`.

Written by the **relay**, read by the **admin** — both bind `DB` in their
`wrangler.toml`. See `db/README.md` for the full rationale. D1 caps **100 bound
variables per statement**, so chunk
any `IN (...)` over a variable-length list (see `fetchMembersByRoom` in
`admin/server/utils/rooms.ts`).

### Legacy server (`server/`) — deprecated

The original Node/Express/Socket.io + Postgres (Drizzle ORM) service. Kept
running on Render **read-mostly** during the host-deprecation window so rooms
hosted by not-yet-updated Unity games keep working (the client falls back to it
via `legacySocket.ts`). **Don't build new features here** — it will be retired
once Unity hosts have migrated.

## Development Commands

### Tooling

Lint/format are at the **repo root** (oxlint + oxfmt), enforced by a Husky +
lint-staged pre-commit hook:

```bash
npm run lint        # oxlint --type-aware
npm run lint:fix    # oxlint --fix
npm run fmt         # oxfmt
npm run fmt:check   # oxfmt --check
```

### Running services

The root `npm run dev` runs **client (9001), docs (9002), and the LEGACY server
(9000)** concurrently — it predates the migration and does **not** start the
relay/api/admin Workers. Run those individually with `wrangler dev`:

```bash
# from the repo root
npm run dev            # legacy server + client + docs (see caveat above)

# Cloudflare Workers — run each in its own dir
cd relay && npm run dev   # wrangler dev — Room DO (partyserver, :1999)
cd api   && npm run dev   # wrangler dev — Hono API (:8787)
cd admin && npm run dev   # nuxt dev (:9003), DB + RELAY bindings via nitro-cloudflare-dev
cd client && npm run dev  # vite (:9001)
cd docs  && npm run dev   # nuxt dev (:9002)
```

Each Worker dir has `npm run type-check` (`tsc --noEmit`, or `nuxt typecheck` /
`vue-tsc` for admin/client) and `npm run deploy` (`wrangler deploy`, prefixed by
a build for admin/client/docs). Deploys also run automatically via **Workers
Builds** on pushes that touch each Worker's root dir.

### Tests

Every project has a Vitest suite (`cd <dir> && npm test`, or `npm run test:watch`).
The two Workers (`relay/`, `api/`) run via **`@cloudflare/vitest-pool-workers`** —
tests execute *inside* `workerd` (config: each Worker's `vitest.config.ts`);
`client/` runs in **jsdom** with `@vue/test-utils`; `admin/` runs in plain
**node** (its server utils are pure functions over mocked `db`/`env`).

- **`relay/`** — bindings are the real runtime objects (the `Room` Durable Object
  + the D1 `DB`, wired from `wrangler.toml`; storage is isolated + rolled back per
  test). Covers the pure state helpers (`relay/test/roomState.test.ts`) and the
  **wire-protocol contract** end-to-end over a real WebSocket against the `Room`
  DO (`relay/test/protocol.test.ts`: handshake rejection + terminal close codes,
  the `state.host` roster, full-replacement `member.update`, the replay cache,
  one-connection-per-user eviction). Since the protocol is a hard public contract
  with third-party hosts, **add a protocol test when you touch routing or the
  envelope shape.** Gotcha: isolated storage rolls back DO *storage* between
  tests, but the in-memory `Room` singleton keeps its cached `settings`, so the
  protocol tests use a fresh room code per test.
- **`api/`** — the only binding is the `RELAY` service binding; tests inject a
  mock relay via `app.request(..., env)` rather than a live relay Worker (the
  config stubs `RELAY` so `workerd` starts). Covers `generateRoomCode` +
  `RelayClient` (`api/test/relay.test.ts`) and the routes
  (`api/test/routes.test.ts`: the 8-attempt code-allocation retry loop, the 503
  give-up, and closed-room visibility rules).
- **`client/`** — the SDK envelope contract is the priority: `hackboxSocket.ts`
  is tested with `partysocket` mocked (`client/test/hackboxSocket.test.ts`:
  `emit`/`on` ⇄ `{ type, payload }`, pong/garbage filtering, fatal-close ≥4000 →
  terminal `disconnect` + no reconnect, the 25s keepalive). Also the pure
  state/prop helpers (`helpers.test.ts`, `stateHelpers.test.ts`) and the
  component→socket emit contract (`ButtonComponent.test.ts` — a press emits a
  `msg` envelope). Tests live in `client/test/` (a sibling of `src/`), so
  `vue-tsc` type-check doesn't include them.

- **`admin/`** — the D1/relay helpers in `server/utils/rooms.ts`
  (`admin/test/rooms.test.ts`): the **`fetchMembersByRoom` chunking** under the
  90-bound-variable D1 cap (the documented correctness risk), the row/metadata
  mappers, `fetchMessageHistory` DESC→ascending ordering + payload parsing, and
  the relay-overlay presence merge (`overlayPresence` / `fetchLiveMessages`) with
  its unreachable-relay fallbacks. Plain functions over a mock `db`/`env`, so no
  Nuxt runtime is needed — but `npm test` does need `.nuxt/tsconfig` (from the
  `postinstall` `nuxt prepare`) for the transform to resolve types.

`.github/workflows/ci.yml` runs `fmt:check` + each project's type-check and tests
on every push/PR.

### D1 schema

```bash
# from the repo root, with wrangler authenticated
npx wrangler d1 execute hackbox --remote --file=db/schema.sql
```

## Member state & components

When a host sends a player UI, it sets that player's **member state** — a single
object with three top-level keys, each optional (omitted keys fall back to
defaults):

```json
{
  "theme": { "header": {}, "main": {} },
  "ui": { "header": { "text": "Round 1" }, "main": { "align": "start", "components": [] } },
  "presets": {}
}
```

::important:: **State is a full replacement.** Every `member.update` replaces the
target's entire state — the `data` is merged onto a blank default canvas, not
onto the player's current screen. Always send the complete screen. This is also
why the relay can cache + replay each player's last state verbatim on reconnect.

`ui.main.components` is an ordered list of `{ "type": <ComponentName>, "props": {} }`.
`PlayerView.vue` renders each by `type`. The full component catalog and protocol
are documented in `docs/content/` (the public docs).

### Adding a new player component

1. Create the component in `client/src/components/` (receives a `custom`/props
   object from the server state).
2. Export it from `client/src/components/index.ts`.
3. Emit socket events for user interactions via the injected socket
   (`inject("socket")`) — `msg` on submit, `change` while editing.
4. The host receives those as `msg` / `change` envelopes from the relay.
5. Document the component in `docs/content/2.components/`.

### Updating member state from a host

```jsonc
// host -> relay
{ "type": "member.update", "payload": { "to": "<userId | userId[]>", "data": {} } }
```

The relay (`relay/src/main.ts`) routes it to the target connection(s) and updates
the replay cache.
