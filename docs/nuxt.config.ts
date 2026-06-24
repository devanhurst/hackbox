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
  // Site-level SEO metadata. Unlike the player client (kept deliberately bare,
  // jackbox.tv-style), the docs ARE meant to be discoverable, so give crawlers
  // a clear description + canonical host. nuxt-seo (bundled by Docus) uses these
  // as the defaults for <meta description>, canonical URLs, and OG tags on every
  // docs page; per-page frontmatter `seo:` blocks override them.
  site: {
    name: "Hackbox",
    url: "https://hackbox.ca",
    description:
      "Hackbox is a real-time multiplayer platform and developer SDK for building interactive, host-driven experiences where players use their mobile devices as live controllers.",
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
