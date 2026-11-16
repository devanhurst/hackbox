import { describe, expect, it } from "vitest";
import { siblingPreviewHost } from "../src/lib/previewHosts";

describe("siblingPreviewHost", () => {
  it("swaps the worker segment on a branch preview host", () => {
    expect(
      siblingPreviewHost(
        "claude-new-prompt-ab12cd-hackbox-client.devan-hurst.workers.dev",
        "hackbox-client",
        "hackbox-api",
      ),
    ).toBe("claude-new-prompt-ab12cd-hackbox-api.devan-hurst.workers.dev");
  });

  it("ignores deployment hosts, whose id differs between Workers", () => {
    expect(
      siblingPreviewHost(
        "18f050f3-hackbox-client.devan-hurst.workers.dev",
        "hackbox-client",
        "hackbox-api",
      ),
    ).toBeNull();
  });

  it("ignores production and non-preview hosts", () => {
    expect(siblingPreviewHost("hackbox.ca", "hackbox-client", "hackbox-api")).toBeNull();
    expect(siblingPreviewHost("localhost", "hackbox-client", "hackbox-api")).toBeNull();
    expect(
      siblingPreviewHost("hackbox-client.devan-hurst.workers.dev", "hackbox-client", "hackbox-api"),
    ).toBeNull();
  });
});
