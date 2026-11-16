// Production admin sits behind Cloudflare Access on hackbox.ca/admin*, and the
// Worker has no auth of its own. A Preview's workers.dev URL is not behind that
// Access app, yet reads the production database, so its server routes stay shut
// until Access protects this Worker's Previews and PREVIEW_ACCESS_PROTECTED is
// set to "true" in wrangler.toml.
export default defineEventHandler((event) => {
  const env = event.context.cloudflare?.env as
    | { ENVIRONMENT?: string; PREVIEW_ACCESS_PROTECTED?: string }
    | undefined;
  if (env?.ENVIRONMENT === "preview" && env.PREVIEW_ACCESS_PROTECTED !== "true") {
    throw createError({
      statusCode: 403,
      statusMessage: "Admin Previews are disabled until Cloudflare Access protects them",
    });
  }
});
