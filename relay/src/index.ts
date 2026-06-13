import { getServerByName } from "partyserver";
import { Room } from "./main";

export { Room };

interface Env {
  Main: DurableObjectNamespace<Room>;
}

// Worker entry. We route `/rooms/<code>` ourselves rather than using
// partyserver's routePartykitRequest, which mandates a three-segment
// `/<prefix>/<party>/<room>` path. Routing by hand lets the realtime endpoint be
// the minimal `wss://hackbox.ca/rooms/<code>` (a single static prefix is still
// required: the apex serves the SPA and Cloudflare routes by path, not by the
// WebSocket Upgrade header, so the relay needs its own path to be routable).
//
// `getServerByName` resolves the Durable Object by name and calls its setName
// RPC, so `this.name` (the room code) is set correctly — the part the bare
// `stub.fetch()` would otherwise miss. Both the WebSocket upgrade and the api
// Worker's HTTP calls (`/rooms/<code>` and `/rooms/<code>/init`) flow through
// here; trailing path segments are handled by the DO's onRequest.
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const parts = new URL(request.url).pathname.split("/").filter(Boolean);
    if (parts[0] === "rooms" && parts[1]) {
      const stub = await getServerByName(env.Main, parts[1].toUpperCase());
      return stub.fetch(request);
    }
    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
