// Vite emits content-hashed build assets under this prefix. A request for a
// hash that no longer exists means a tab is running a pre-deploy build.
const BUILD_ASSET_PREFIX = "/assets/";
// The build writes the empty SPA shell to 200.html (served at /200 by
// html_handling); index.html is the prerendered lobby, so it can't be the
// fallback for app routes like /play.
const SPA_SHELL_PATH = "/200";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const res = await env.ASSETS.fetch(request);
    if (res.status !== 404) return res;

    // A stale tab asking for a missing hashed chunk must not be handed HTML
    // (the browser would fail to parse it as JS/CSS). The client recovers on
    // its next full reload.
    if (url.pathname.startsWith(BUILD_ASSET_PREFIX)) return res;

    const shell = await env.ASSETS.fetch(new URL(SPA_SHELL_PATH, url));
    return new Response(shell.body, { status: 200, headers: shell.headers });
  },
};
