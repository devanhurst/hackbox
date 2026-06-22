import { fileURLToPath, URL } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

// A dedicated test config rather than the prod vite.config.ts: tests only need
// the Vue plugin + the `@` alias, not the Sentry sourcemap-upload plugin. The
// player UI is a browser SPA, so tests run in jsdom with @vue/test-utils.
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
  },
});
