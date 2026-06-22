import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock partysocket so the SDK can be driven without a real WebSocket: the fake
// records sends/closes and lets tests fire transport events (open/message/close/
// error) at the wrapper.
class FakePartySocket {
  static last: FakePartySocket | null = null;
  opts: Record<string, any>;
  readyState = 1; // WebSocket.OPEN
  sent: string[] = [];
  closeCount = 0;
  private handlers: Record<string, Array<(e?: any) => void>> = {};

  constructor(opts: Record<string, any>) {
    this.opts = opts;
    FakePartySocket.last = this;
  }
  addEventListener(type: string, cb: (e?: any) => void) {
    (this.handlers[type] ??= []).push(cb);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closeCount++;
  }
  // Test helper: dispatch a transport event to the registered handlers.
  fire(type: string, event?: any) {
    for (const cb of this.handlers[type] ?? []) cb(event);
  }
}

vi.mock("partysocket", () => ({ default: FakePartySocket }));

// Imported after the mock is registered.
const { createHackboxSocket } = await import("../src/lib/sockets/hackboxSocket");

function setup(over: Record<string, any> = {}) {
  const socket = createHackboxSocket({
    host: "hackbox.ca",
    roomCode: "bcdf",
    userId: "p1",
    userName: "Alice",
    ...over,
  });
  return { socket, fake: FakePartySocket.last! };
}

afterEach(() => {
  FakePartySocket.last = null;
  vi.useRealTimers();
});

describe("connection setup", () => {
  it("upper-cases the room code into the room + basePath", () => {
    const { fake } = setup();
    expect(fake.opts.room).toBe("BCDF");
    expect(fake.opts.basePath).toBe("r/BCDF");
  });

  it("passes identity through the connect query, stringifying metadata", () => {
    const { fake } = setup({ metadata: { twitchAccessToken: "tok" } });
    expect(fake.opts.query).toMatchObject({ userId: "p1", userName: "Alice" });
    expect(JSON.parse(fake.opts.query.metadata)).toEqual({ twitchAccessToken: "tok" });
  });
});

describe("envelope mapping", () => {
  it("emit() sends a { type, payload } JSON envelope", () => {
    const { socket, fake } = setup();
    socket.emit("msg", { event: "buzz", value: "A" });
    expect(JSON.parse(fake.sent[0]!)).toEqual({
      type: "msg",
      payload: { event: "buzz", value: "A" },
    });
  });

  it("an inbound frame dispatches to on() listeners by type, with the payload", () => {
    const { socket, fake } = setup();
    const received: unknown[] = [];
    socket.on("state.member", (p) => received.push(p));

    fake.fire("message", { data: JSON.stringify({ type: "state.member", payload: { ui: 1 } }) });
    expect(received).toEqual([{ ui: 1 }]);
  });

  it("ignores keepalive pongs, non-string data, malformed JSON, and untyped frames", () => {
    const { socket, fake } = setup();
    const seen: unknown[] = [];
    socket.on("state.member", (p) => seen.push(p));
    socket.on("pong", (p) => seen.push(p));

    fake.fire("message", { data: "pong" });
    fake.fire("message", { data: new ArrayBuffer(8) });
    fake.fire("message", { data: "{not json" });
    fake.fire("message", { data: JSON.stringify({ payload: { ui: 1 } }) }); // no type
    expect(seen).toEqual([]);
  });

  it("an error frame from the relay maps onto the 'error' event", () => {
    const { socket, fake } = setup();
    let msg: string | undefined;
    socket.on("error", (p) => (msg = (p as { message: string }).message));
    fake.fire("message", {
      data: JSON.stringify({ type: "error", payload: { message: "This room is closed." } }),
    });
    expect(msg).toBe("This room is closed.");
  });
});

describe("listener registration", () => {
  it("on() returns an unsubscribe and off() removes a listener", () => {
    const { socket, fake } = setup();
    const calls: number[] = [];
    const cb = () => calls.push(1);

    const unsub = socket.on("reload", cb);
    fake.fire("message", { data: JSON.stringify({ type: "reload" }) });
    unsub();
    fake.fire("message", { data: JSON.stringify({ type: "reload" }) });

    const cb2 = () => calls.push(2);
    socket.on("reload", cb2);
    socket.off("reload", cb2);
    fake.fire("message", { data: JSON.stringify({ type: "reload" }) });

    expect(calls).toEqual([1]);
  });

  it("a throwing listener does not stop other listeners", () => {
    const { socket, fake } = setup();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const calls: string[] = [];
    socket.on("x", () => {
      throw new Error("boom");
    });
    socket.on("x", () => calls.push("ok"));

    fake.fire("message", { data: JSON.stringify({ type: "x" }) });
    expect(calls).toEqual(["ok"]);
    errorSpy.mockRestore();
  });
});

describe("close semantics", () => {
  it("a fatal close (>= 4000) emits a terminal disconnect with the reason and halts reconnect", () => {
    const { socket, fake } = setup();
    let reason: unknown;
    socket.on("disconnect", (r) => (reason = r));

    fake.fire("close", { code: 4001, reason: "This room has expired." });
    expect(reason).toBe("This room has expired.");
    expect(fake.closeCount).toBe(1); // partysocket auto-reconnect halted
  });

  it("a transient close (< 4000) emits a non-terminal 'transport close'", () => {
    const { socket, fake } = setup();
    let reason: unknown;
    socket.on("disconnect", (r) => (reason = r));

    fake.fire("close", { code: 1006, reason: "" });
    expect(reason).toBe("transport close");
    expect(fake.closeCount).toBe(0); // let partysocket reconnect
  });

  it("once fatal, later transient close/error events do not re-emit", () => {
    const { socket, fake } = setup();
    const reasons: unknown[] = [];
    socket.on("disconnect", (r) => reasons.push(r));

    fake.fire("close", { code: 4000, reason: "gone" });
    fake.fire("close", { code: 1006, reason: "" });
    fake.fire("error");
    expect(reasons).toEqual(["gone"]);
  });

  it("close() halts the socket and reports disconnected", () => {
    const { socket, fake } = setup();
    socket.close();
    expect(fake.closeCount).toBe(1);
    fake.readyState = 3; // CLOSED
    expect(socket.connected).toBe(false);
  });
});

describe("keepalive", () => {
  beforeEach(() => vi.useFakeTimers());

  it("sends a ping on the interval while open, and stops after close()", () => {
    const { socket, fake } = setup();
    fake.fire("open");

    vi.advanceTimersByTime(25_000);
    expect(fake.sent).toEqual(["ping"]);

    vi.advanceTimersByTime(25_000);
    expect(fake.sent).toEqual(["ping", "ping"]);

    socket.close();
    vi.advanceTimersByTime(50_000);
    expect(fake.sent).toEqual(["ping", "ping"]); // no further pings
  });

  it("does not ping when the socket is not open", () => {
    const { fake } = setup();
    fake.fire("open");
    fake.readyState = 0; // CONNECTING
    vi.advanceTimersByTime(25_000);
    expect(fake.sent).toEqual([]);
  });
});
