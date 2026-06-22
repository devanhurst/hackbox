import { describe, expect, it } from "vitest";
import app from "../src/index";
import type { RoomProbe } from "../src/relay";

// Drives the Hono app with a mock RELAY service binding injected as the request
// env, so the route logic (code-allocation retries, closed-room visibility) is
// exercised without a live relay Worker.
function withRelay(handler: (req: Request) => Response | Promise<Response>) {
  const requests: Request[] = [];
  const env = {
    RELAY: {
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const req = input instanceof Request ? input : new Request(input, init);
        requests.push(req);
        return handler(req);
      },
    },
  };
  return { env, requests };
}

const probe = (over: Partial<RoomProbe> = {}): RoomProbe => ({
  exists: true,
  closed: false,
  twitchRequired: false,
  hasHost: false,
  isMember: false,
  ...over,
});

describe("GET /api/healthcheck", () => {
  it("returns ok", async () => {
    const { env } = withRelay(() => new Response("unused"));
    const res = await app.request("/api/healthcheck", {}, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("POST /api/rooms", () => {
  it("rejects a request with no hostId without touching the relay", async () => {
    const { env, requests } = withRelay(() => new Response("unused"));
    const res = await app.request(
      "/api/rooms",
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
      env,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "hostId required" });
    expect(requests).toHaveLength(0);
  });

  it("allocates a room code on the first try", async () => {
    const { env, requests } = withRelay(() => Response.json({ ok: true }));
    const res = await app.request(
      "/api/rooms",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hostId: "h" }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; roomCode: string };
    expect(body.ok).toBe(true);
    expect(body.roomCode).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
    expect(requests).toHaveLength(1);
  });

  it("retries with a fresh code when the relay reports a collision (409)", async () => {
    let calls = 0;
    const { env, requests } = withRelay(() => {
      calls++;
      return calls < 4
        ? Response.json({ ok: false, error: "exists" }, { status: 409 })
        : Response.json({ ok: true });
    });
    const res = await app.request(
      "/api/rooms",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hostId: "h" }),
      },
      env,
    );
    expect(res.status).toBe(200);
    expect(requests).toHaveLength(4);
    // Each retry should use a distinct code, not re-submit the collided one.
    const codes = requests.map((r) => new URL(r.url).pathname);
    expect(new Set(codes).size).toBe(4);
  });

  it("gives up with 503 after 8 collisions", async () => {
    const { env, requests } = withRelay(() => Response.json({ ok: false }, { status: 409 }));
    const res = await app.request(
      "/api/rooms",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hostId: "h" }),
      },
      env,
    );
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false });
    expect(requests).toHaveLength(8);
  });

  it("forwards twitchRequired to the relay", async () => {
    const { env, requests } = withRelay(() => Response.json({ ok: true }));
    await app.request(
      "/api/rooms",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hostId: "h", twitchRequired: true }),
      },
      env,
    );
    expect(await requests[0]!.json()).toMatchObject({ hostId: "h", twitchRequired: true });
  });
});

describe("GET /api/rooms/:roomCode", () => {
  it("reports an open room as existing with its twitchRequired flag", async () => {
    const { env } = withRelay(() => Response.json(probe({ exists: true, twitchRequired: true })));
    const res = await app.request("/api/rooms/BCDF", {}, env);
    expect(await res.json()).toEqual({ exists: true, twitchRequired: true });
  });

  it("reports a non-existent room as not existing", async () => {
    const { env } = withRelay(() => Response.json(probe({ exists: false })));
    const res = await app.request("/api/rooms/BCDF", {}, env);
    expect(await res.json()).toEqual({ exists: false });
  });

  it("hides a closed room from a non-member", async () => {
    const { env } = withRelay(() => Response.json(probe({ closed: true, isMember: false })));
    const res = await app.request("/api/rooms/BCDF", {}, env);
    expect(await res.json()).toEqual({ exists: false });
  });

  it("reveals a closed room to a member", async () => {
    const { env } = withRelay(() =>
      Response.json(probe({ closed: true, isMember: true, twitchRequired: false })),
    );
    const res = await app.request("/api/rooms/BCDF?userId=p1", {}, env);
    expect(await res.json()).toEqual({ exists: true, twitchRequired: false });
  });

  it("upper-cases the code and forwards the userId to the relay probe", async () => {
    const { env, requests } = withRelay(() =>
      Response.json(probe({ closed: true, isMember: true })),
    );
    await app.request("/api/rooms/bcdf?userId=p1", {}, env);
    const url = new URL(requests[0]!.url);
    expect(url.pathname).toBe("/r/BCDF");
    expect(url.searchParams.get("userId")).toBe("p1");
  });
});
