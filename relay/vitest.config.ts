import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// Tests run *inside* workerd via @cloudflare/vitest-pool-workers, so the `Room`
// Durable Object and the D1 `DB` binding are the real runtime objects, wired up
// from wrangler.toml. Storage is isolated + rolled back per test, so each test
// starts from an empty room/D1.
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.toml" },
      // Override the (public) Twitch client id from wrangler.toml's [vars] with an
      // empty value in tests, so the auth-guard protocol tests exercise the reject
      // paths without making live calls to api.twitch.tv.
      miniflare: { bindings: { TWITCH_CLIENT_ID: "" } },
    }),
  ],
});
