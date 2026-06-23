# Admin room-focused page — robustness

**Date:** 2026-06-23
**Status:** Approved (design)

## Problem

The room-focused admin page (`admin/app/pages/rooms/[id].vue`) has three shortcomings:

1. **Host/member connection status is stale.** The page fetches presence once on
   mount and never re-polls, so the host badge and per-member `online` flags
   freeze at page-open. The Activity feed only *looks* realtime because
   `RoomMonitor` polls messages on a 1.5s timer; nothing does the equivalent for
   presence. (The rooms *list* page stays fresh because it auto-refreshes every
   5s.)
2. **Members render as a plain, unsorted table.** They should be sortable by
   online status and by user name.
3. **The page wastes horizontal space.** It is capped at `max-w-3xl` with all
   cards stacked in a single narrow column.

### Root cause of #1

The `GET /api/room/:id` server route (`admin/server/api/room/[id].get.ts`)
already returns live presence: it calls `overlayPresence()`
(`admin/server/utils/rooms.ts`), which hits the relay Durable Object's
`adminStatus()` over the `RELAY` service binding for `hasHost` and each member's
`online`. The data is correct — it is simply fetched only once. The page's
`watch(roomId, …, { immediate: true })` calls `load()` on mount and never again.

> Note on "connect directly to the DO": the relay's `/admin/*` surface is
> reachable **only** via the admin Worker's service binding, never the public
> internet (see CLAUDE.md routing). So the browser cannot open a socket to the
> DO; "pull realtime state from the DO" means the admin server route proxies the
> DO's live `adminStatus()` and the browser polls that route. This matches how
> messages already work.

## Design

### 1. Realtime presence overlay poll

**New server route:** `admin/server/api/room/[id]/live.get.ts`

- Resolve the room's `code` from D1 by `id`
  (`SELECT code FROM rooms WHERE id = ?`). 404 if the row is missing.
- Call the relay `adminStatus()` via the `RELAY` service binding
  (`GET https://relay/admin/room/<code>`) and return only the live overlay:

  ```jsonc
  {
    "live": true,
    "hasHost": false,
    "expiresAt": 1750000000000,
    "onlineCount": 2,
    "members": [
      { "userId": "…", "userName": "…", "twitch": null, "online": true }
    ]
  }
  ```

- On unreachable relay or ended room: `{ live: false, hasHost: false, expiresAt: null, onlineCount: 0, members: [] }`.
- This route does **no** D1 roster query — the durable roster comes from the
  one-time `room/:id` load; this route is the light, frequently-polled overlay.
- Factor the relay call so it reuses the existing service-binding pattern in
  `admin/server/utils/rooms.ts` (a small `fetchLivePresence(env, code)` helper
  alongside `overlayPresence`/`fetchLiveMessages`), keeping the route handler
  thin and unit-testable.

**Page change:** `admin/app/pages/rooms/[id].vue`

- Add a presence poll mirroring `RoomMonitor`'s timer:
  - Runs only while `isLive(room)`; `setInterval` at ~2000ms.
  - `onBeforeUnmount` clears it; it is (re)synced when `roomId`/liveness changes.
- Each tick fetches `room/:id/live` and **merges** the overlay onto the existing
  reactive `room.value` without replacing the whole object:
  - For each member already in `room.members` (from D1): set `online` from the
    overlay (default `false` if absent).
  - Append any overlay member **not** present in the D1 roster (preserves
    today's `overlayPresence` "DO member missing from D1" behavior).
  - Refresh `room.hasHost`, `room.onlineCount`, `room.expiresAt`.
- The poll must **not** touch `edit.*`, so in-progress settings checkboxes are
  never clobbered. The one-time `load()` remains the sole seeder of the durable
  roster and of `edit.*`.
- A transient fetch failure is swallowed (next tick retries), same as
  `RoomMonitor.poll()`.

### 2. Sortable members table

The existing `UTable` in `pages/rooms/[id].vue` becomes sortable via Nuxt UI's
column sorting:

- **Status** (online) and **Name** columns get sortable headers (clickable, with
  a sort-direction indicator).
- Default sort: **online first, then user name A→Z** — connected players float to
  the top.
- **Twitch** and **User ID** columns remain non-sorted.
- The table moves into the right column of the new grid; its fixed `max-h-72`
  scroll cap is relaxed (taller cap or natural height) now that it has room.

Implementation detail: Nuxt UI `UTable` sorting uses TanStack-style column
defs with `enableSorting` + a header that toggles sort, plus a `sorting` model
(or `:sort`/sorting state) for the default order. Match whatever the installed
`@nuxt/ui` version expects (the same major version already used by
`RoomsTable.vue`). The online sort key is the boolean `online`; the name sort key
is `userName`.

### 3. Wider two-column layout

- `<main>` container: `max-w-3xl` → `max-w-6xl` (matching the list page).
- Responsive grid inside `<template v-else>`:
  - **Left column:** Status/info card, Edit-settings card, Revive/Delete actions.
  - **Right column:** Members table card, then the `RoomMonitor` (Activity) card.
  - Single column on small screens (stacks as today) — e.g.
    `grid-cols-1 lg:grid-cols-[…]` with the left column a fixed/narrower track and
    the right column flexible.
- The sticky header is unchanged.

## Out of scope

- No change to the wire protocol or the relay's `adminStatus()` shape (it already
  returns everything needed).
- No change to message polling (`RoomMonitor` stays as-is).
- No new realtime transport (no WebSocket from browser to relay; polling only,
  consistent with the existing architecture).

## Testing

`admin/` tests are plain functions over a mock `db`/`env` (`admin/test/rooms.test.ts`).

- Add a unit test for the new `fetchLivePresence(env, code)` helper:
  - Maps the relay JSON to the overlay shape.
  - Returns the safe `{ live: false, … }` fallback when the relay responds
    non-OK or throws (mirror the `overlayPresence` fallback tests).
- The page-level merge logic (online flip, append-unknown, no `edit` clobber) is
  Vue-component behavior; if a pure merge helper is extracted it gets a unit test,
  otherwise it is covered by manual verification (the admin suite does not mount
  Nuxt components).

## Files touched

| File | Change |
| --- | --- |
| `admin/server/api/room/[id]/live.get.ts` | **New** — live presence overlay route. |
| `admin/server/utils/rooms.ts` | Add `fetchLivePresence(env, code)` helper. |
| `admin/app/pages/rooms/[id].vue` | Presence poll + merge; sortable members table; two-column `max-w-6xl` layout. |
| `admin/test/rooms.test.ts` | Tests for `fetchLivePresence`. |
| `admin/app/types.ts` | (If needed) a `LivePresenceResponse` type. |
