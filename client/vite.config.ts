import { fileURLToPath, URL } from "url";
import { sentryVitePlugin } from "./$node_modules/@sentry/vite-plugin/dist/types/index.js";
import { defineConfig, loadEnv } from "./$node_modules/vite/dist/node/index.js";
import vue from "./$node_modules/@vitejs/plugin-vue/dist/index.mjs";
import vueJsx from "./$node_modules/@vitejs/plugin-vue-jsx/dist/index.mjs";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

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
      port: parseInt(env.VITE_PORT as string, 10),
    },
  };
});
