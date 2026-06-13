import { routePartykitRequest } from "partyserver";

export { Room } from "./main";

interface Env {
  Main: DurableObjectNamespace;
}

// Worker entry. partyserver routes `/relay/:party/:room` requests (both
// WebSocket upgrades and the plain-HTTP onRequest surface) to the right `Room`
// Durable Object. The `/relay` prefix (instead of the default `/parties`) lets
// the relay live under the apex at hackbox.ca/relay/* — a path prefix, not a
// `relay.` subdomain, which some users' SNI-filtering middleboxes reset. The
// client SDK's partysocket prefix must match. Everything else 404s.
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (
      (await routePartykitRequest(request, env as unknown as Record<string, DurableObjectNamespace>, {
        prefix: "relay",
      })) || new Response("Not Found", { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
