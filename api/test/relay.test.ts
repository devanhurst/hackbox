import { describe, expect, it } from "vitest";
import { generateRoomCode, RelayClient } from "../src/relay";

// A stub service binding: records the requests RelayClient makes and replays
// canned responses, so initRoom/probeRoom can be tested without the real relay.
function mockRelay(handler: (req: Request) => Response): { fetcher: Fetcher; requests: Request[] } {
  const requests: Request[] = [];
  const fetcher = {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = input instanceof Request ? input : new Request(input, init);
      requests.push(req);
      return handler(req);
    },
  } as unknown as Fetcher;
  return { fetcher, requests };
}

describe("generateRoomCode", () => {
  it("is always four consonants from the allowed alphabet", () => {
    for (let i = 0; i < 500; i++) {
      expect(generateRoomCode()).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
    }
  });

  it("excludes vowels and ambiguous letters (no A, E, I, O, U)", () => {
    const code = Array.from({ length: 200 }, () => generateRoomCode()).join("");
    expect(code).not.toMatch(/[AEIOU]/);
  });
});

describe("RelayClient.initRoom", () => {
  it("POSTs to /r/<code>/init with the hostId + twitchRequired and returns true on success", async () => {
    const { fetcher, requests } = mockRelay(() => Response.json({ ok: true, roomCode: "BCDF" }));
    const ok = await new RelayClient(fetcher).initRoom("BCDF", "host-1", true);

    expect(ok).toBe(true);
    expect(requests).toHaveLength(1);
    const req = requests[0]!;
    expect(req.method).toBe("POST");
    expect(new URL(req.url).pathname).toBe("/r/BCDF/init");
    expect(await req.json()).toEqual({ hostId: "host-1", twitchRequired: true });
  });

  it("returns false on 409 so the caller retries with a fresh code", async () => {
    const { fetcher } = mockRelay(() =>
      Response.json({ ok: false, error: "exists" }, { status: 409 }),
    );
    expect(await new RelayClient(fetcher).initRoom("BCDF", "host-1", false)).toBe(false);
  });

  it("throws on an unexpected relay error", async () => {
    const { fetcher } = mockRelay(() => new Response("boom", { status: 500 }));
    await expect(new RelayClient(fetcher).initRoom("BCDF", "host-1", false)).rejects.toThrow(
      /relay init failed: 500/,
    );
  });
});

describe("RelayClient.probeRoom", () => {
  it("passes the userId through as a query param and returns the parsed probe", async () => {
    const probe = {
      exists: true,
      closed: false,
      twitchRequired: true,
      hasHost: true,
      isMember: true,
    };
    const { fetcher, requests } = mockRelay(() => Response.json(probe));

    const result = await new RelayClient(fetcher).probeRoom("BCDF", "p1");

    expect(result).toEqual(probe);
    const url = new URL(requests[0]!.url);
    expect(url.pathname).toBe("/r/BCDF");
    expect(url.searchParams.get("userId")).toBe("p1");
  });

  it("omits the userId param when no user is given", async () => {
    const { fetcher, requests } = mockRelay(() =>
      Response.json({
        exists: false,
        closed: false,
        twitchRequired: false,
        hasHost: false,
        isMember: false,
      }),
    );

    await new RelayClient(fetcher).probeRoom("BCDF");
    expect(new URL(requests[0]!.url).searchParams.has("userId")).toBe(false);
  });

  it("throws when the relay probe fails", async () => {
    const { fetcher } = mockRelay(() => new Response("nope", { status: 500 }));
    await expect(new RelayClient(fetcher).probeRoom("BCDF")).rejects.toThrow(
      /relay probe failed: 500/,
    );
  });
});
