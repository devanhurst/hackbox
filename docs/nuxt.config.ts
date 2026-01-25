// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  extends: ["docus"],
  compatibilityDate: "2024-11-01",
  devtools: { enabled: true },
  css: ["~/assets/css/main.css"],
  site: {
    name: "Hackbox",
  },
  runtimeConfig: {
    public: {
      serverUrl: process.env.VITE_SERVER_URL || "http://localhost:9000",
    },
  },
});
