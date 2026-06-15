// Build an absolute path to a server API route, honouring the app's base path so
// the same code works whether the admin is served under /admin/ (current) or at
// the root. Returns e.g. apiUrl("rooms") -> "/admin/api/rooms".
export function useApi() {
  const base = useRuntimeConfig().app.baseURL || "/";
  return (path: string) => `${base.replace(/\/$/, "")}/api/${path.replace(/^\//, "")}`;
}
