import type { D1Database } from "@cloudflare/workers-types";
import { describe, expect, it } from "vitest";
import type { AdminEnv } from "../server/utils/env";
import {
  type AdminMessage,
  enrichMessageNames,
  fetchLiveMessages,
  fetchLivePresence,
  fetchMembers,
  fetchMembersByRoom,
  fetchMessageHistory,
  mapRow,
  overlayPresence,
  parseMetadata,
  twitchName,
  type RoomRow,
} from "../server/utils/rooms";

// A mock D1: every prepare().bind().all() records the (sql, binds) it was called
// with and returns whatever the handler produces for those binds.
function mockDb(handler: (binds: unknown[]) => unknown[]) {
  const queries: Array<{ sql: string; binds: unknown[] }> = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...binds: unknown[]) {
          return {
            all: async () => {
              queries.push({ sql, binds });
              return { results: handler(binds) };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
  return { db, queries };
}

// A mock admin env whose RELAY binding answers with the given handler.
function mockEnv(handler: (url: string) => Response | Promise<Response>): AdminEnv {
  return {
    DB: undefined as unknown as D1Database,
    RELAY: {
      fetch: async (input: Request | string) =>
        handler(typeof input === "string" ? input : input.url),
    },
  };
}

describe("twitchName", () => {
  it("pulls the twitch username out of member metadata", () => {
    expect(twitchName(JSON.stringify({ twitch: { username: "streamer" } }))).toBe("streamer");
  });

  it("returns null for absent, malformed, or twitch-less metadata", () => {
    expect(twitchName(null)).toBeNull();
    expect(twitchName("{not json")).toBeNull();
    expect(twitchName(JSON.stringify({ other: 1 }))).toBeNull();
  });
});

describe("parseMetadata", () => {
  it("parses valid JSON and returns undefined for null/garbage", () => {
    expect(parseMetadata(JSON.stringify({ a: 1 }))).toEqual({ a: 1 });
    expect(parseMetadata(null)).toBeUndefined();
    expect(parseMetadata("{nope")).toBeUndefined();
  });
});

describe("mapRow", () => {
  it("maps snake_case columns to camelCase and coerces int flags to booleans", () => {
    const row: RoomRow = {
      id: "id-1",
      code: "BCDF",
      host_id: "host-1",
      twitch_required: 1,
      persistent: 0,
      closed: 1,
      created_at: 1000,
      ended_at: null,
      end_reason: null,
    };
    expect(mapRow(row)).toEqual({
      id: "id-1",
      code: "BCDF",
      hostId: "host-1",
      twitchRequired: true,
      persistent: false,
      closed: true,
      createdAt: 1000,
      endedAt: null,
      endReason: null,
    });
  });
});

describe("fetchMembers", () => {
  it("maps member rows, parsing twitch and defaulting online to false", async () => {
    const { db, queries } = mockDb(() => [
      {
        user_id: "u1",
        user_name: "ALICE",
        metadata: JSON.stringify({ twitch: { username: "al" } }),
      },
      { user_id: "u2", user_name: "BOB", metadata: null },
    ]);

    const members = await fetchMembers(db, "room-1");

    expect(queries[0]!.binds).toEqual(["room-1"]);
    expect(members).toEqual([
      { userId: "u1", userName: "ALICE", twitch: "al", online: false },
      { userId: "u2", userName: "BOB", twitch: null, online: false },
    ]);
  });
});

describe("fetchMembersByRoom", () => {
  it("does not query when there are no room ids", async () => {
    const { db, queries } = mockDb(() => []);
    const byRoom = await fetchMembersByRoom(db, []);
    expect(byRoom.size).toBe(0);
    expect(queries).toHaveLength(0);
  });

  it("chunks ids under the 90-variable D1 cap and merges every room's roster", async () => {
    const ids = Array.from({ length: 200 }, (_, i) => `room-${i}`);
    // One member per requested room id in each chunk.
    const { db, queries } = mockDb((binds) =>
      binds.map((id) => ({ room_id: id, user_id: `u-${id}`, user_name: "X", metadata: null })),
    );

    const byRoom = await fetchMembersByRoom(db, ids);

    // 200 ids / 90 per chunk => 3 statements (90 + 90 + 20).
    expect(queries.map((q) => q.binds.length)).toEqual([90, 90, 20]);
    expect(Math.max(...queries.map((q) => q.binds.length))).toBeLessThanOrEqual(90);
    expect(byRoom.size).toBe(200);
    expect(byRoom.get("room-0")).toEqual([
      { userId: "u-room-0", userName: "X", twitch: null, online: false },
    ]);
    expect(byRoom.get("room-199")).toHaveLength(1);
  });

  it("groups multiple members under the same room id", async () => {
    const { db } = mockDb(() => [
      { room_id: "r1", user_id: "a", user_name: "A", metadata: null },
      { room_id: "r1", user_id: "b", user_name: "B", metadata: null },
    ]);
    const byRoom = await fetchMembersByRoom(db, ["r1"]);
    expect(byRoom.get("r1")).toHaveLength(2);
  });
});

describe("fetchMessageHistory", () => {
  it("reverses the DESC page into ascending order and parses JSON payloads", async () => {
    const { db, queries } = mockDb(() => [
      {
        seq: 3,
        direction: "host_to_member",
        type: "state.member",
        from_user: null,
        to_user: "u1",
        event: null,
        payload: JSON.stringify({ ui: 1 }),
        timestamp: 30,
      },
      {
        seq: 2,
        direction: "member_to_host",
        type: "msg",
        from_user: "u1",
        to_user: null,
        event: "buzz",
        payload: "not json",
        timestamp: 20,
      },
      {
        seq: 1,
        direction: "member_to_host",
        type: "msg",
        from_user: "u1",
        to_user: null,
        event: null,
        payload: null,
        timestamp: 10,
      },
    ]);

    const messages = await fetchMessageHistory(db, "room-1", 4, 50);

    expect(queries[0]!.binds).toEqual(["room-1", 4, 50]);
    expect(messages.map((m) => m.seq)).toEqual([1, 2, 3]); // reversed to ascending
    expect(messages[2]!.payload).toEqual({ ui: 1 }); // JSON parsed
    expect(messages[1]!.payload).toBe("not json"); // non-JSON falls back to the raw string
    expect(messages[0]!.payload).toBeNull(); // null stays null
  });
});

describe("enrichMessageNames", () => {
  const msg = (over: Partial<AdminMessage>): AdminMessage => ({
    seq: 1,
    direction: "member_to_host",
    type: "msg",
    from: null,
    to: null,
    event: null,
    payload: null,
    timestamp: 0,
    ...over,
  });

  it("resolves from/to ids to roster display names", () => {
    const nameById = new Map([
      ["u1", "ALICE"],
      ["u2", "BOB"],
    ]);
    const messages = enrichMessageNames(
      [
        msg({ direction: "member_to_host", from: "u1", to: null }),
        msg({ direction: "host_to_member", from: null, to: "u2" }),
      ],
      nameById,
    );

    expect(messages[0]).toMatchObject({ fromName: "ALICE", toName: null });
    expect(messages[1]).toMatchObject({ fromName: null, toName: "BOB" });
  });

  it("leaves the name null for ids absent from the roster", () => {
    const [m] = enrichMessageNames([msg({ from: "ghost", to: null })], new Map());
    expect(m!.fromName).toBeNull();
  });
});

describe("fetchLiveMessages", () => {
  it("returns the relay tail on success", async () => {
    const env = mockEnv(() => Response.json({ messages: [{ seq: 5 }], nextSeq: 6, oldestSeq: 1 }));
    const res = await fetchLiveMessages(env, "BCDF", 4, 200);
    expect(res).toEqual({ messages: [{ seq: 5 }], nextSeq: 6, oldestSeq: 1 });
  });

  it("defaults nextSeq to since+1 and oldestSeq to null when the relay omits them", async () => {
    const env = mockEnv(() => Response.json({}));
    const res = await fetchLiveMessages(env, "BCDF", 4, 200);
    expect(res).toEqual({ messages: [], nextSeq: 5, oldestSeq: null });
  });

  it("returns null on a non-ok relay response or a thrown error", async () => {
    expect(
      await fetchLiveMessages(
        mockEnv(() => new Response("", { status: 502 })),
        "BCDF",
        0,
        1,
      ),
    ).toBeNull();
    expect(
      await fetchLiveMessages(
        mockEnv(() => {
          throw new Error("down");
        }),
        "BCDF",
        0,
        1,
      ),
    ).toBeNull();
  });
});

describe("overlayPresence", () => {
  it("marks known members online and appends live members not in history", async () => {
    const env = mockEnv(() =>
      Response.json({
        exists: true,
        hasHost: true,
        expiresAt: 999,
        members: [
          { userId: "u1", userName: "ALICE", online: true, twitch: null },
          { userId: "u2", userName: "NEW", online: true, twitch: "tw" },
        ],
      }),
    );
    const members = [{ userId: "u1", userName: "ALICE", twitch: null, online: false }];

    const meta = await overlayPresence(env, "BCDF", members);

    expect(members.find((m) => m.userId === "u1")!.online).toBe(true);
    const appended = members.find((m) => m.userId === "u2");
    expect(appended).toMatchObject({ userName: "NEW", twitch: "tw", online: true });
    expect(meta).toEqual({ live: true, hasHost: true, expiresAt: 999 });
  });

  it("reports a not-live room when the relay says it no longer exists", async () => {
    const env = mockEnv(() => Response.json({ exists: false }));
    expect(await overlayPresence(env, "BCDF", [])).toEqual({
      live: false,
      hasHost: false,
      expiresAt: null,
    });
  });

  it("falls back to not-live when the relay is unreachable", async () => {
    const env = mockEnv(() => {
      throw new Error("down");
    });
    expect(await overlayPresence(env, "BCDF", [])).toEqual({
      live: false,
      hasHost: false,
      expiresAt: null,
    });
  });
});

describe("fetchLivePresence", () => {
  it("maps the relay status to the live-overlay shape", async () => {
    const env = mockEnv(() =>
      Response.json({
        exists: true,
        hasHost: true,
        expiresAt: 999,
        members: [
          { userId: "u1", userName: "ALICE", online: true, twitch: null },
          { userId: "u2", userName: "BOB", online: false, twitch: "tw" },
        ],
      }),
    );

    const p = await fetchLivePresence(env, "BCDF");

    expect(p).toEqual({
      live: true,
      hasHost: true,
      expiresAt: 999,
      onlineCount: 1,
      members: [
        { userId: "u1", userName: "ALICE", twitch: null, online: true },
        { userId: "u2", userName: "BOB", twitch: "tw", online: false },
      ],
    });
  });

  it("reports not-live when the relay says the room no longer exists", async () => {
    const env = mockEnv(() => Response.json({ exists: false }));
    expect(await fetchLivePresence(env, "BCDF")).toEqual({
      live: false,
      hasHost: false,
      expiresAt: null,
      onlineCount: 0,
      members: [],
    });
  });

  it("falls back to an empty not-live overlay on a non-ok or thrown relay response", async () => {
    expect(
      await fetchLivePresence(
        mockEnv(() => new Response("", { status: 502 })),
        "BCDF",
      ),
    ).toEqual({ live: false, hasHost: false, expiresAt: null, onlineCount: 0, members: [] });
    expect(
      await fetchLivePresence(
        mockEnv(() => {
          throw new Error("down");
        }),
        "BCDF",
      ),
    ).toEqual({ live: false, hasHost: false, expiresAt: null, onlineCount: 0, members: [] });
  });
});
