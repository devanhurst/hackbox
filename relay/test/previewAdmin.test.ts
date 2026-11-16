import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src/index";

// A relay Preview's workers.dev URL is public, so /admin/* must not be reachable
// without the admin secret there. Production relies on the route and binding.
const adminRequest = (headers: Record<string, string> = {}) =>
  new Request("https://preview/admin/room/PADM", { headers });

describe("/admin/* in a Preview", () => {
  it("is refused without the admin secret", async () => {
    const res = await worker.fetch(adminRequest(), {
      ...env,
      ENVIRONMENT: "preview",
      ADMIN_SECRET: "s3cret",
    } as never);
    expect(res.status).toBe(403);
  });

  it("is refused when no admin secret is configured", async () => {
    const res = await worker.fetch(adminRequest({ "x-hackbox-admin": "" }), {
      ...env,
      ENVIRONMENT: "preview",
    } as never);
    expect(res.status).toBe(403);
  });

  it("is served with the matching admin secret", async () => {
    const res = await worker.fetch(adminRequest({ "x-hackbox-admin": "s3cret" }), {
      ...env,
      ENVIRONMENT: "preview",
      ADMIN_SECRET: "s3cret",
    } as never);
    expect(res.status).not.toBe(403);
  });
});
