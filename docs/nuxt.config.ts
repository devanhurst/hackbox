// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  extends: ["docus"],
  compatibilityDate: "2024-11-01",
  devtools: { enabled: true },
  css: ["~/assets/css/main.css"],
  // Served behind the hackbox.ca/docs* Worker route, so the whole prerendered
  // site (router + assets) lives under /docs. Matches the apex path-prefix
  // strategy used by admin (/admin*), api (/api*), and relay (/r/*).
  app: {
    baseURL: "/docs/",
  },
  site: {
    name: "Hackbox",
  },
  // The site is served under a base URL (/docs/) rather than a domain root, so
  // skip robots.txt generation (Docus's @nuxt/robots refuses to emit one with a
  // base URL set, which otherwise fails `nuxt generate`).
  robots: {
    robotsTxt: false,
  },
  // Docus bundles @nuxt/og-image, which renders social-card PNGs via a native
  // (resvg) rasterizer during prerender. That rasterizer panics on this build,
  // aborting the crawler mid-run — and dynamic OG cards can't be served from a
  // static-assets Worker anyway. Disable it.
  ogImage: {
    enabled: false,
  },
  // @nuxt/fonts (pulled in by @nuxt/ui) resolves every CSS `font-family` against
  // remote font providers AT BUILD TIME — it fetches each provider's metadata
  // index (Google Fonts, Google Icons, Bunny, Fontshare, Fontsource) during the
  // Vite client transform, then downloads the matching woff2 files. Those fetches
  // (via unifont/ofetch) have NO timeout, so on Cloudflare Workers Builds — whose
  // egress to those hosts hangs rather than rejecting — the transform blocks
  // forever and the build hits the 20-minute CI timeout ("transforming…" never
  // completes). The docs are a static-assets Worker with no need for self-hosted
  // webfonts, so disable every remote provider (leaving only the bundled `local`
  // one). This makes the build hermetic; typography falls back to the system
  // stack. Same rationale as disabling og-image above.
  fonts: {
    providers: {
      google: false,
      googleicons: false,
      bunny: false,
      fontshare: false,
      fontsource: false,
      adobe: false,
      npm: false,
    },
  },
  nitro: {
    // Force the pure-static preset. On Cloudflare Workers Builds, Nitro otherwise
    // auto-detects the CF environment and switches to the `cloudflare-module`
    // (SSR) preset even under `nuxt generate` — emitting a server entry plus a
    // `.wrangler/deploy/config.json` that redirects `wrangler deploy` to a
    // `.output/server/index.mjs` it never produces, and overriding the [assets]
    // in wrangler.toml. We deploy as a pure assets-only Worker (prerendered HTML
    // + the @nuxt/content WASM dump), so pin the static preset to keep CI
    // matching local and let `wrangler deploy` use wrangler.toml.
    preset: "static",
    // The site is served at hackbox.ca/docs* by a static-assets Worker, which
    // matches request paths to files literally. Nitro strips the /docs/ baseURL
    // when writing files, so emit the public output INTO a physical dist/docs/
    // directory; the Worker then points [assets] at dist/, making on-disk paths
    // (dist/docs/_nuxt/...) line up with the served URLs (/docs/_nuxt/...).
    output: {
      publicDir: "./dist/docs",
    },
  },
  // Optional overrides for the playground's backend endpoints. Left empty by
  // default: the playground derives them from the current origin at runtime (in
  // production the docs are served from hackbox.ca alongside the api/relay, and
  // in dev it points at the local Worker ports). Set these to target a specific
  // host. See components/DeviceConnection.vue.
  runtimeConfig: {
    public: {
      apiUrl: process.env.NUXT_PUBLIC_API_URL || "",
      relayHost: process.env.NUXT_PUBLIC_RELAY_HOST || "",
    },
  },
});
