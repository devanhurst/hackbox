import { defineConfig } from "vitest/config";

// The admin server utils (server/utils/rooms.ts) are plain functions that take
// the D1 `db` / relay `env` as arguments and have only type-only imports, so
// they test in a plain node environment with mocks — no Nuxt/Nitro runtime
// needed.
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
