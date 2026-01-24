export default defineAppConfig({
  port: import.meta.env.VITE_PORT,
  backendUri: import.meta.env.VITE_BACKEND_URI,
  github: {
    url: "https://github.com/devanhurst/hackbox",
    branch: "main",
    rootDir: "docs",
  },
});
