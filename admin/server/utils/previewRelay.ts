import type { RelayFetcher } from "./env";

// Workers Builds serves each branch's Preview of every Worker at
// `<branch>-<worker>.<subdomain>.workers.dev`. Deployment hosts carry an 8-hex
// id unique to each Worker instead of the branch, so they have no sibling.
export function siblingPreviewHost(hostname: string, from: string, to: string): string | null {
  if (!hostname.endsWith(".workers.dev")) return null;
  const segment = `-${from}.`;
  const at = hostname.indexOf(segment);
  if (at <= 0) return null;
  if (/^[0-9a-f]{8}$/.test(hostname.slice(0, at))) return null;
  return `${hostname.slice(0, at)}-${to}.${hostname.slice(at + segment.length)}`;
}

// A Preview's service bindings call the bound Worker's production deployment,
// so an admin Preview reaches its own branch's relay Preview over HTTPS. The
// relay Preview's /admin/* routes are on a public URL, so every call carries
// ADMIN_SECRET (checked in relay/src/index.ts). Null when this admin host has
// no branch to match, such as a deployment URL.
export function previewRelay(adminHostname: string, adminSecret: string): RelayFetcher | null {
  const relayHost = siblingPreviewHost(adminHostname, "hackbox-admin", "hackbox-relay");
  if (!relayHost) return null;
  return {
    fetch(input: Request | string, init?: RequestInit) {
      const req = new Request(input, init);
      const url = new URL(req.url);
      url.protocol = "https:";
      url.host = relayHost;
      const proxied = new Request(url, req);
      proxied.headers.set("x-hackbox-admin", adminSecret);
      return fetch(proxied);
    },
  };
}
