// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2024-11-01",
  devtools: { enabled: true },
  modules: ["@nuxt/content", "@nuxt/ui"],
  css: ["~/assets/css/main.css"],
  app: {
    head: {
      title: "Hackbox Docs",
      meta: [
        { charset: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        {
          name: "description",
          content:
            "Documentation for integrating with Hackbox - a real-time multiplayer game platform",
        },
      ],
    },
  },
});
