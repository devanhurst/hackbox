// Talks to the hackbox-relay Worker over a service binding. The relay owns all
// room state (in its `Room` Durable Object), so the api Worker is a thin HTTP
// front door: it allocates a unique code and asks the relay to initialise the
// room, then answers existence probes. Requests go through the relay Worker's
// default fetch → routePartykitRequest, which resolves the DO by name from the
// `/parties/main/<code>` path, so `this.name` inside the DO is the room code.

// The host of this URL is irrelevant over a service binding (only the path is
// routed); a stable placeholder keeps the requests readable in logs.
const RELAY_ORIGIN = "https://hackbox-relay";

const roomPath = (code: string) => `${RELAY_ORIGIN}/parties/main/${code}`;

// 4-character consonant code, ported verbatim from the legacy
// `server/models/Room.ts:generateRoomCode()`.
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

  // Ask the relay to initialise a freshly-allocated room. Returns false on a
  // 409 (the code is already taken) so the caller can retry with a new code.
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
