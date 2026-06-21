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
