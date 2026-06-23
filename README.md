# hackbox

A real-time multiplayer game platform (think Jackbox): a host drives UI onto
players' phones and receives their interactions, relayed in real time. Hosts
integrate over a small `{ type, payload }` JSON-over-WebSocket protocol — any
WebSocket client in any language can host a game.

Runs entirely on Cloudflare (Durable Objects + D1 + Workers).

## Packages

| Dir | What it is |
| --- | --- |
| `relay/` | Realtime core — a `Room` Durable Object (`hackbox-relay`). |
| `api/` | HTTP front door — Hono Worker (`hackbox-api`), creates rooms. |
| `client/` | Vue 3 player app (`hackbox-client`). |
| `admin/` | Nuxt 3 admin dashboard (`hackbox-admin`). |
| `db/` | Cloudflare D1 schema (room/member history). |
| `docs/` | Public docs site ([hackbox.ca/docs](https://hackbox.ca/docs)). |
| `server/` | Legacy Node/Socket.io server — deprecated. |

## Docs

[hackbox.ca/docs](https://hackbox.ca/docs) — protocol, components, and a build-a-game tutorial.

For architecture and local development, see [CLAUDE.md](./CLAUDE.md).

## License

[MIT](./LICENSE)
