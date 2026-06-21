export function useApi() {
  const base = useRuntimeConfig().app.baseURL || "/";
  return (path: string) => `${base.replace(/\/$/, "")}/api/${path.replace(/^\//, "")}`;
}
