# hackbox-unity migration plan

A change plan for migrating [hackbox-unity](https://github.com/devanhurst/hackbox-unity)
(the C#/Unity host package) off the old socket.io endpoint onto the new
Cloudflare relay. **hackbox hosts are Unity games**, so this package — not the
JS player client — is the real host-migration path for the Cloudflare move.

## Why it's a small change

The package already abstracts its connection behind an `ISocketIO` interface
(`Runtime/Sockets/ISocketIO.cs`), and **the application protocol is unchanged** —
the same event names (`state.host`, `msg`, `change`, `member.update`, `reload`)
and the same JSON payloads. Only the *transport* moves from socket.io to raw
WebSocket. So the migration is contained to the socket layer plus a handful of
lines in `Host.cs`; the bulk of the package is untouched.

### Unaffected (build/parse the same JSON)

`State`, `StateAsset`, `UI/*`, `Parameters/*`, `Builders/*`, `Member`,
`Message`, `MessageEventQueue`, `MessageEventCollection`, `Events`, the editor
tooling, and **all consumer game code**. The payloads these produce/consume are
identical on the new relay.

### Changes

- `Runtime/Host.cs` — endpoints + how the socket URL is built (a few lines).
- `Runtime/Sockets/*` — the transport implementations.

## The protocol delta

Old (socket.io): each event is a native socket.io frame —
`socket.Emit("member.update", payload)` / `socket.On("msg", handler)`.

New (raw WebSocket): every frame is a JSON envelope `{ "type", "payload" }`:

```
host -> relay : { "type": "member.update", "payload": { "to": [...], "data": {...} } }
                { "type": "reload" }
relay -> host : { "type": "state.host", "payload": { "members": {...} } }
                { "type": "msg",    "payload": { "from", "event", "message", "timestamp" } }
                { "type": "change", "payload": { ... } }
```

Identity is by query param on connect (`userId` = the room's hostId). The relay
also sends `{ "type": "error", "payload": { "message" } }` then closes with a
code ≥ 4000 for terminal rejections (room gone/closed/expired, duplicate device).

## Plan

### 1. Endpoints (`Runtime/Host.cs`)

- `URL`: `https://app.hackbox.ca/` → `https://hackbox.ca/`.
- Rooms endpoint: `"{URL}rooms/"` → `"{URL}api/rooms"`. The `POST` body
  (`{ hostId, twitchRequired }`) and response (`{ ok, roomCode }`) are unchanged.
- Socket URL: build `wss://hackbox.ca/r/<roomCode>?userId=<hostId>`. The room
  code moves from a query parameter into the **path**; `userId` stays a query
  param. Drop the socket.io engine-version argument (the `4` passed to the
  socket ctor).

### 2. Keep the `ISocketIO` seam; change only the wire

Keep `ISocketIO`'s `Emit(string eventName, string message)` /
`On(string eventName, Action<JObject>)` surface so `Host.cs`'s `On(...)`/`Emit(...)`
calls stay as-is. The new implementation does the envelope translation:

- **Emit:** send a text frame `{"type": eventName, "payload": <message>}`
  (`message` is already a JSON string, so this is a wrap).
- **Receive:** parse `{ type, payload }`, then dispatch the `On(type)` handler
  with `payload` as the `JObject`.
- **Keepalive:** send a `ping` text frame every ~25s; the relay replies `pong`.
  Wire these into the existing `OnPing`/`OnPong` events (the latency UI) — record
  send time on `ping`, raise `OnPong(rtt)` on `pong`.
- **Reconnect:** implement backoff reconnect inside the impl, raising
  `OnReconnectAttempt`/`OnReconnected`/`OnReconnectFailed`. On a close code
  ≥ 4000, treat it as **fatal**: raise `OnError`/`OnDisconnected` and do **not**
  reconnect (surface the preceding `error` frame's message).

### 3. Transport implementation — two options

**Option A — adopt `NativeWebSocket` (recommended).** [`endel/NativeWebSocket`](https://github.com/endel/NativeWebSocket)
provides one `WebSocket` class that works on both standalone (via
`System.Net.WebSockets`) and WebGL (via a bundled `.jslib`). Collapse
`StandaloneSocketIO` + `WebGLSocketIO` into a single `HackboxSocket : ISocketIO`,
and **delete** the bundled C# socket.io client
(`Runtime/Sockets/Standalone/SocketIOClient/`) and the WebGL socket.io `.jslib`.
On WebGL, pump `DispatchMessageQueue()` from `Host`'s `Update()`. Trade-off: one
small MIT dependency, but a large net reduction in bundled code.

**Option B — hand-roll.** Standalone: `System.Net.WebSockets.ClientWebSocket`
(built into Mono/IL2CPP). WebGL: rewrite the existing `.jslib` to use the browser
`WebSocket` (`ClientWebSocket` does not work under WebGL). No new dependency, but
you own a jslib, a receive loop, and the threading yourself.

Either option removes the bundled socket.io library entirely.

### 4. Threading

Raw-WS receive callbacks arrive off Unity's main thread (standalone) or across
the JS bridge (WebGL). Keep marshaling through the existing `MessageEventQueue` /
`DoUnityAction` concurrent queue, exactly as the socket.io implementations did.

### 5. Cleanup

- Delete `Runtime/Sockets/Standalone/SocketIOClient/` and the WebGL socket.io
  `.jslib`.
- Remove socket.io-specific config (engine version, namespaces).
- Update `package.json` / `.asmdef` (add NativeWebSocket if Option A) and
  `CHANGELOG.md`. This is a **breaking** release — bump the major version.

### 6. Validate

Unity doesn't run headless in CI easily, so validate manually against the
deployed relay (or `wrangler dev` locally with `URL` pointed at it):

1. `POST /api/rooms` → room code.
2. Host connects to `wss://.../r/<code>?userId=<hostId>`; receives `state.host`.
3. A player joins (via the hackbox web client) → host sees `state.host` update.
4. Host sends `member.update` → player screen updates.
5. Player interacts → host receives `msg` / `change`.
6. Kill/restore the network → reconnect works; let the room idle past 24h → it
   expires.

## File inventory

| File | Action |
| --- | --- |
| `Runtime/Host.cs` | Edit — URLs (`hackbox.ca`, `/api/rooms`) + socket URL (`/r/<code>?userId=`) |
| `Runtime/Sockets/ISocketIO.cs` | Keep (optionally rename to `IHackboxSocket`) |
| `Runtime/Sockets/Standalone/StandaloneSocketIO.cs` | Replace with raw-WS impl (or delete if Option A merges platforms) |
| `Runtime/Sockets/WebGL/WebGLSocketIO.cs` | Replace with raw-WS impl (or delete if Option A merges platforms) |
| `Runtime/Sockets/Standalone/SocketIOClient/**` | Delete (bundled socket.io client) |
| WebGL socket.io `.jslib` | Delete |
| `Runtime/{State,StateAsset,Member,Message,...}.cs`, `UI/*`, `Parameters/*`, `Builders/*` | Untouched |
| `package.json` / `.asmdef` / `CHANGELOG.md` | Edit (dependency + version bump) |
