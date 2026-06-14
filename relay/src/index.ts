import { getServerByName } from "partyserver";
import { Room } from "./main";
import { Registry } from "./registry";

export { Room, Registry };

interface Env {
  Main: DurableObjectNamespace<Room>;
  Registry: DurableObjectNamespace<Registry>;
}

// Worker entry. We route `/r/<code>` ourselves rather than using partyserver's
// routePartykitRequest, which mandates a three-segment `/<prefix>/<party>/<room>`
// path. Routing by hand lets the realtime endpoint be the minimal
// `wss://hackbox.ca/r/<code>` (a single static prefix is still required: the apex
// serves the SPA and Cloudflare routes by path, not by the WebSocket Upgrade
// header, so the relay needs its own path to be routable).
//
// `getServerByName` resolves the Durable Object by name and calls its setName
// RPC, so `this.name` (the room code) is set correctly — the part the bare
// `stub.fetch()` would otherwise miss. Both the WebSocket upgrade and the api
// Worker's HTTP calls (`/r/<code>` and `/r/<code>/init`) flow through here;
// trailing path segments are handled by the DO's onRequest.
//
// `/admin/rooms` returns the registry listing for the admin monitor. It is
// served only via the api/admin Worker service bindings — the relay's only
// public route is `hackbox.ca/r/*` and its workers_dev URL is disabled, so
// `/admin/*` never arrives from the public internet.
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const parts = new URL(request.url).pathname.split("/").filter(Boolean);

    if (parts[0] === "r" && parts[1]) {
      const stub = await getServerByName(env.Main, parts[1].toUpperCase());
      return stub.fetch(request);
    }

    if (parts[0] === "admin" && parts[1] === "rooms") {
      const registry = env.Registry.get(env.Registry.idFromName("index"));
      return registry.fetch(new Request("https://relay/list"));
    }

    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
