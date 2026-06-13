# @hackbox/client

The connection SDK for hackbox hosts and players.

hackbox runs on Cloudflare now: the realtime relay is a Durable Object, which
speaks **raw WebSocket** rather than the socket.io/engine.io protocol. This SDK
wraps a `partysocket` connection and re-exposes the **same event surface** the
old socket.io client had, so migrating means swapping your connection import —
not your logic. The event names and payloads are unchanged (see
hackbox.ca/docs).

## Install

```bash
npm install @hackbox/client
```

## Host usage

```ts
import { createHackboxSocket } from "@hackbox/client";

// 1. Create a room over HTTP (unchanged):
//    POST https://hackbox.ca/api/rooms { hostId, twitchRequired? } -> { roomCode }

const socket = createHackboxSocket({
  host: "hackbox.ca",
  roomCode,
  userId: hostId, // connecting with the room's hostId makes you the host
});

socket.on("state.host", (state) => {
  /* { members: { [userId]: { id, name, online, twitchData } } } */
});
socket.on("msg", (m) => {
  /* { from, event, message, timestamp } — a player submitted */
});
socket.on("change", (m) => {
  /* same shape — a player's in-progress change */
});

// Push UI to players:
socket.emit("member.update", { to: [userId], data: { ui: { main: { components: [...] } } } });
socket.emit("reload");
```

## Player usage

```ts
const socket = createHackboxSocket({
  host: "hackbox.ca",
  roomCode,
  userId, // any id other than the hostId joins as a player
  userName,
  metadata: { twitchAccessToken },
});

socket.on("state.member", (state) => {
  /* the player's UI state */
});
socket.on("reload", () => location.reload());
socket.on("error", (e) => alert((e as { message: string }).message));
socket.on("disconnect", (reason) => {
  /* terminal reasons (room gone/closed/expired, duplicate device) navigate away */
});

socket.emit("msg", { event: "MyEvent", value: "buzz" });
socket.emit("change", { event: "MyEvent", value: [...] });
```

## Migrating from socket.io

| Before (socket.io)                          | After (`@hackbox/client`)                       |
| ------------------------------------------- | ----------------------------------------------- |
| `io(url, { query: { userId, ... } })`       | `createHackboxSocket({ host, roomCode, userId })` |
| `socket.on("state.member", cb)`             | `socket.on("state.member", cb)` (unchanged)     |
| `socket.emit("member.update", payload)`     | `socket.emit("member.update", payload)` (unchanged) |

The transport URL is now `wss://hackbox.ca/relay/main/<roomCode>` and is
managed for you — pass `host` + `roomCode` instead of a socket.io URL.
