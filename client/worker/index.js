// Vite emits content-hashed build assets under this prefix. A request for a
// hash that no longer exists means a tab is running a pre-deploy build.
const BUILD_ASSET_PREFIX = "/assets/";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const res = await env.ASSETS.fetch(request);

    // SPA fallback returns the HTML shell (200) for unmatched paths — correct
    // for app routes, but a stale tab asking for a missing hashed chunk must
    // not be handed HTML (the browser would fail to parse it as JS/CSS). Return
    // a real 404 instead; the client recovers on its next full reload.
    const isMissingBuildAsset =
      url.pathname.startsWith(BUILD_ASSET_PREFIX) &&
      res.status === 200 &&
      (res.headers.get("content-type") || "").includes("text/html");

    if (isMissingBuildAsset) {
      return new Response("Not Found", {
        status: 404,
        headers: { "content-type": "text/plain" },
      });
    }

    return res;
  },
};
