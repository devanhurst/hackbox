// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2026-04-09",
  devtools: { enabled: true },

  // The admin is a small authenticated dashboard with entirely dynamic data —
  // render it as an SPA (the original tool was static HTML + client JS too). The
  // Worker still runs Nitro for the /admin/api/* routes.
  ssr: false,

  modules: ["@nuxt/ui", "nitro-cloudflare-dev"],

  css: ["~/assets/css/main.css"],

  // Served behind the hackbox.ca/admin* Worker route, so the whole app (router,
  // assets, and API routes) lives under /admin.
  app: {
    baseURL: "/admin/",
    head: {
      meta: [{ name: "robots", content: "noindex" }],
      // Inline SVG favicon (purple square) so the browser doesn't 404 on /favicon.ico.
      link: [
        {
          rel: "icon",
          type: "image/svg+xml",
          href: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect width='16' height='16' rx='3' fill='%237c2fec'/%3E%3C/svg%3E",
        },
      ],
    },
  },

  // Force the admin into dark mode to match the original purple-on-near-black tool.
  colorMode: { preference: "dark", fallback: "dark" },

  // Deploy as a Cloudflare Worker (Nitro module output) so the D1 (`DB`) and relay
  // (`RELAY`) bindings declared in wrangler.toml are reachable from server routes
  // via `event.context.cloudflare.env`. `nitro-cloudflare-dev` wires those same
  // bindings into `nuxt dev`.
  nitro: {
    preset: "cloudflare_module",
    cloudflare: {
      deployConfig: true,
      nodeCompat: true,
    },
  },
});
