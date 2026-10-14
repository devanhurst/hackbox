import { fileURLToPath, URL } from "url";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vueJsx from "@vitejs/plugin-vue-jsx";

// https://vitejs.dev/config/
export default defineConfig(({ isSsrBuild }) => {
  return {
    plugins: [
      vue({}),
      vueJsx({}),
      // The SSR bundle is only run at build time and is never deployed.
      !isSsrBuild &&
        sentryVitePlugin({
          authToken: process.env.SENTRY_AUTH_TOKEN,
          org: "hackbox",
          project: "client",
        }),
    ],
    build: { copyPublicDir: !isSsrBuild },
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
