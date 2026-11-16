// The `/r/<code>` path must match the relay Worker's router (and the client SDK's
// partysocket basePath).
const RELAY_ORIGIN = "https://hackbox-relay";

const roomPath = (code: string) => `${RELAY_ORIGIN}/r/${code}`;

const CONSONANTS = "BCDFGHJKLMNPQRSTVWXZ".split("");
export const generateRoomCode = (): string =>
  [1, 2, 3, 4].map(() => CONSONANTS[Math.floor(Math.random() * CONSONANTS.length)]).join("");

export interface RoomProbe {
  exists: boolean;
  closed: boolean;
  twitchRequired: boolean;
  hasHost: boolean;
  isMember: boolean;
}

export class RelayClient {
  constructor(private relay: Fetcher) {}

  // 409 means the code is already taken; returns false so the caller retries.
  async initRoom(code: string, hostId: string, twitchRequired: boolean): Promise<boolean> {
    const res = await this.relay.fetch(
      new Request(`${roomPath(code)}/init`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hostId, twitchRequired }),
      }),
    );
    if (res.status === 409) return false;
    if (!res.ok) throw new Error(`relay init failed: ${res.status}`);
    return true;
  }

  async probeRoom(code: string, userId?: string): Promise<RoomProbe> {
    const url = new URL(roomPath(code));
    if (userId) url.searchParams.set("userId", userId);
    const res = await this.relay.fetch(new Request(url.toString()));
    if (!res.ok) throw new Error(`relay probe failed: ${res.status}`);
    return res.json<RoomProbe>();
  }
}

// Workers Builds serves each branch's Preview of every Worker at
// `<branch>-<worker>.<subdomain>.workers.dev`. Deployment hosts carry an 8-hex
// id unique to each Worker instead of the branch, so they have no sibling.
function siblingPreviewHost(hostname: string, from: string, to: string): string | null {
  if (!hostname.endsWith(".workers.dev")) return null;
  const segment = `-${from}.`;
  const at = hostname.indexOf(segment);
  if (at <= 0) return null;
  if (/^[0-9a-f]{8}$/.test(hostname.slice(0, at))) return null;
  return `${hostname.slice(0, at)}-${to}.${hostname.slice(at + segment.length)}`;
}

// A Preview's service bindings call the bound Worker's production deployment,
// so a preview api reaches its own branch's relay Preview over HTTPS instead.
// Null when this api host has no branch to match, such as a deployment URL;
// the caller must then refuse rather than use the production relay.
export function previewRelay(apiHostname: string): Fetcher | null {
  const relayHost = siblingPreviewHost(apiHostname, "hackbox-api", "hackbox-relay");
  if (!relayHost) return null;
  return {
    fetch(input: RequestInfo | URL, init?: RequestInit) {
      const req = new Request(input, init);
      const url = new URL(req.url);
      url.protocol = "https:";
      url.host = relayHost;
      return fetch(new Request(url, req));
    },
  } as Fetcher;
}
