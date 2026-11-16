// Workers Builds serves each branch's Preview of every Worker at
// `<branch>-<worker>.<subdomain>.workers.dev`, so a sibling Worker's Preview of
// the same branch differs only in the worker segment. Deployment hosts carry an
// 8-hex id unique to each Worker instead of the branch, so they have no sibling.
export function siblingPreviewHost(hostname: string, from: string, to: string): string | null {
  if (!hostname.endsWith(".workers.dev")) return null;
  const segment = `-${from}.`;
  const at = hostname.indexOf(segment);
  if (at <= 0) return null;
  if (/^[0-9a-f]{8}$/.test(hostname.slice(0, at))) return null;
  return `${hostname.slice(0, at)}-${to}.${hostname.slice(at + segment.length)}`;
}
