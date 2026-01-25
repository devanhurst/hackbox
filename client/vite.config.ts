import { fileURLToPath, URL } from "url";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vueJsx from "@vitejs/plugin-vue-jsx";

// https://vitejs.dev/config/
export default defineConfig(() => {
  return {
    plugins: [
      vue({}),
      vueJsx({}),
      sentryVitePlugin({
        authToken: process.env.SENTRY_AUTH_TOKEN,
        org: "hackbox",
        project: "client",
      }),
    ],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    server: {
      port: parseInt(process.env.PORT as string, 10),
    },
  };
});
