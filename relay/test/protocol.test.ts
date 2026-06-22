import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

// The wire protocol is Hackbox's public contract with third-party (Unity) hosts
// that can't be redeployed, so these drive a real WebSocket against the real
// `Room` Durable Object through the Worker's fetch entrypoint — the same path a
// host/player takes — and assert the envelopes that come back.

const HOST_ID = "host-1";

// A fresh room code per test: isolated storage is rolled back between tests, but
// the in-memory `Room` DO singleton keeps its cached `settings`, so reusing a
// code would make re-init return 409. A new code maps to a brand-new DO.
let roomSeq = 0;
let CODE = "ROOM0";

// Mirrors db/schema.sql. The relay's D1 writes are best-effort (wrapped in
// try/catch), but creating the tables keeps test output free of caught-error
// noise and lets history-write assertions be added later.
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS rooms (
     id TEXT PRIMARY KEY, code TEXT NOT NULL, host_id TEXT NOT NULL,
     twitch_required INTEGER NOT NULL DEFAULT 0, persistent INTEGER NOT NULL DEFAULT 0,
     closed INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL,
     ended_at INTEGER, end_reason TEXT)`,
  `CREATE TABLE IF NOT EXISTS members (
     id TEXT PRIMARY KEY, room_id TEXT NOT NULL, room_code TEXT NOT NULL,
     user_id TEXT NOT NULL, user_name TEXT NOT NULL, created_at INTEGER NOT NULL,
     metadata TEXT)`,
  `CREATE TABLE IF NOT EXISTS messages (
     id TEXT PRIMARY KEY, room_id TEXT NOT NULL, room_code TEXT NOT NULL,
     seq INTEGER NOT NULL, direction TEXT NOT NULL, type TEXT NOT NULL,
     from_user TEXT, to_user TEXT, event TEXT, payload TEXT, timestamp INTEGER NOT NULL)`,
];

interface Frame {
  type: string;
  payload?: any;
}

// A connected test client: buffers inbound frames and lets a test await the next
// frame matching a predicate (frames may arrive before the test asks for them).
interface Client {
  send(frame: Frame): void;
  waitFor(match: (f: Frame) => boolean): Promise<Frame>;
  next(type: string): Promise<Frame>;
  closed: Promise<{ code: number; reason: string }>;
}

async function connect(query: string): Promise<Client> {
  const res = await SELF.fetch(`https://hackbox.ca/r/${CODE}${query}`, {
    headers: { Upgrade: "websocket" },
  });
  const ws = res.webSocket;
  if (!ws) throw new Error(`expected a websocket upgrade, got HTTP ${res.status}`);

  const buffered: Frame[] = [];
  const waiters: Array<{ match: (f: Frame) => boolean; resolve: (f: Frame) => void }> = [];

  ws.accept();
  ws.addEventListener("message", (e) => {
    const frame = JSON.parse(e.data as string) as Frame;
    const i = waiters.findIndex((w) => w.match(frame));
    if (i >= 0) waiters.splice(i, 1)[0]!.resolve(frame);
    else buffered.push(frame);
  });

  let resolveClose!: (v: { code: number; reason: string }) => void;
  const closed = new Promise<{ code: number; reason: string }>((r) => (resolveClose = r));
  ws.addEventListener("close", (e) => resolveClose({ code: e.code, reason: e.reason }));

  return {
    send: (frame) => ws.send(JSON.stringify(frame)),
    waitFor: (match) => {
      const i = buffered.findIndex(match);
      if (i >= 0) return Promise.resolve(buffered.splice(i, 1)[0]!);
      return new Promise((resolve) => waiters.push({ match, resolve }));
    },
    next: (type) => {
      const match = (f: Frame) => f.type === type;
      const i = buffered.findIndex(match);
      if (i >= 0) return Promise.resolve(buffered.splice(i, 1)[0]!);
      return new Promise((resolve) => waiters.push({ match, resolve }));
    },
    closed,
  };
}

async function initRoom(body: Record<string, unknown> = { hostId: HOST_ID }): Promise<void> {
  const res = await SELF.fetch(`https://hackbox.ca/r/${CODE}/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok: boolean };
  if (!json.ok) throw new Error(`room init failed: ${JSON.stringify(json)}`);
}

beforeEach(async () => {
  CODE = `ROOM${roomSeq++}`;
  await env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s)));
});

describe("connect handshake", () => {
  it("rejects a connection to a room that does not exist with a terminal close", async () => {
    const member = await connect("?userId=p1&userName=Alice");

    const err = await member.next("error");
    expect(err.payload.message).toBe("This room does not exist.");

    const close = await member.closed;
    // Close code >= 4000 is the SDK's "do not reconnect" signal.
    expect(close.code).toBeGreaterThanOrEqual(4000);
  });

  it("rejects a connection with no user id", async () => {
    await initRoom();
    const bad = await connect("?userName=Nobody");

    const err = await bad.next("error");
    expect(err.payload.message).toBe("Missing user id.");
    expect((await bad.closed).code).toBeGreaterThanOrEqual(4000);
  });
});

describe("member join", () => {
  it("replays the member's default 'waiting for host' screen on join", async () => {
    await initRoom();
    const member = await connect("?userId=p1&userName=Alice");

    const state = await member.next("state.member");
    expect(state.payload.ui.header.text).toBe("Alice");
    expect(state.payload.ui.main.components[0].type).toBe("Text");
    expect(state.payload.ui.main.components[0].props.text).toContain("Hang tight!");
  });

  it("adds the joining member to the host roster, marked online", async () => {
    await initRoom();
    const host = await connect(`?userId=${HOST_ID}&userName=Host`);
    await connect("?userId=p1&userName=Alice");

    const roster = await host.waitFor((f) => f.type === "state.host" && !!f.payload.members.p1);
    expect(roster.payload.members.p1).toMatchObject({
      id: "p1",
      name: "ALICE", // member display names are upper-cased
      online: true,
    });
  });
});

describe("host -> member updates", () => {
  it("delivers a member.update as a full-replacement state.member", async () => {
    await initRoom();
    const host = await connect(`?userId=${HOST_ID}&userName=Host`);
    const member = await connect("?userId=p1&userName=Alice");
    await member.next("state.member"); // consume the join replay

    host.send({
      type: "member.update",
      payload: { to: "p1", data: { ui: { header: { text: "Round 1" } } } },
    });

    const update = await member.next("state.member");
    expect(update.payload.ui.header.text).toBe("Round 1");
    // Full replacement: the blank-canvas theme defaults come back even though the
    // host only sent a header.
    expect(update.payload.theme.header.background).toBe("#222");
  });

  it("ignores a member.update addressed to an unknown user", async () => {
    await initRoom();
    const host = await connect(`?userId=${HOST_ID}&userName=Host`);
    const member = await connect("?userId=p1&userName=Alice");
    await member.next("state.member");

    host.send({
      type: "member.update",
      payload: { to: "ghost", data: { ui: { header: { text: "X" } } } },
    });
    host.send({
      type: "member.update",
      payload: { to: "p1", data: { ui: { header: { text: "Real" } } } },
    });

    // The only update the member sees is their own — the ghost update is dropped.
    const update = await member.next("state.member");
    expect(update.payload.ui.header.text).toBe("Real");
  });
});

describe("replay cache", () => {
  it("replays the last state to a member that reconnects", async () => {
    await initRoom();
    const host = await connect(`?userId=${HOST_ID}&userName=Host`);
    const member = await connect("?userId=p1&userName=Alice");
    await member.next("state.member");

    host.send({
      type: "member.update",
      payload: { to: "p1", data: { ui: { header: { text: "Round 7" } } } },
    });
    await member.next("state.member");

    // Reconnect: a fresh socket for the same user must land back on Round 7, not
    // the default waiting screen.
    const reconnected = await connect("?userId=p1&userName=Alice");
    const replayed = await reconnected.next("state.member");
    expect(replayed.payload.ui.header.text).toBe("Round 7");
  });
});

describe("one connection per user", () => {
  it("evicts the older device when the same user connects again", async () => {
    await initRoom();
    const first = await connect("?userId=p1&userName=Alice");
    await first.next("state.member");

    await connect("?userId=p1&userName=Alice");

    const err = await first.next("error");
    expect(err.payload.message).toBe("You have connected from another device.");
    expect((await first.closed).code).toBeGreaterThanOrEqual(4000);
  });
});
