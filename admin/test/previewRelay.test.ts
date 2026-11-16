import { afterEach, describe, expect, it, vi } from "vitest";
import { previewRelay, siblingPreviewHost } from "../server/utils/previewRelay";

describe("siblingPreviewHost", () => {
  it("swaps the worker segment on a branch preview host", () => {
    expect(
      siblingPreviewHost(
        "claude-x-ab12cd-hackbox-admin.devan-hurst.workers.dev",
        "hackbox-admin",
        "hackbox-relay",
      ),
    ).toBe("claude-x-ab12cd-hackbox-relay.devan-hurst.workers.dev");
  });

  it("ignores deployment and production hosts", () => {
    expect(
      siblingPreviewHost(
        "18f050f3-hackbox-admin.devan-hurst.workers.dev",
        "hackbox-admin",
        "hackbox-relay",
      ),
    ).toBeNull();
    expect(siblingPreviewHost("hackbox.ca", "hackbox-admin", "hackbox-relay")).toBeNull();
  });
});

describe("previewRelay", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends admin calls to the branch's relay Preview with the admin secret", async () => {
    const fetchMock = vi.fn(async (_req: Request) => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    const relay = previewRelay("claude-x-ab12cd-hackbox-admin.devan-hurst.workers.dev", "s3cret");
    await relay!.fetch(new Request("https://relay/admin/room/BCDF", { method: "DELETE" }));

    const sent = fetchMock.mock.calls[0]![0];
    expect(sent.url).toBe(
      "https://claude-x-ab12cd-hackbox-relay.devan-hurst.workers.dev/admin/room/BCDF",
    );
    expect(sent.method).toBe("DELETE");
    expect(sent.headers.get("x-hackbox-admin")).toBe("s3cret");
  });

  it("has no relay for a deployment host", () => {
    expect(previewRelay("18f050f3-hackbox-admin.devan-hurst.workers.dev", "s3cret")).toBeNull();
  });
});
