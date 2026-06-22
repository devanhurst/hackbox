import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// Tests run inside workerd via @cloudflare/vitest-pool-workers, matching the
// relay setup. The api Worker's only binding is the `RELAY` service binding; the
// route tests inject their own mock relay via `app.request(..., env)` rather than
// the real binding, so the relay Worker isn't needed at test time.
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.toml" },
      miniflare: {
        // wrangler.toml binds RELAY to the `hackbox-relay` service, which isn't
        // part of this single-Worker test project. Override it with an inline
        // stub so workerd starts; the route tests never hit it (they pass their
        // own mock relay to `app.request(env)`).
        serviceBindings: {
          RELAY: () => new Response("relay is mocked per-test", { status: 501 }),
        },
      },
    }),
  ],
});
