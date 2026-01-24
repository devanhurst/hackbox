export default defineAppConfig({
  port: import.meta.env.VITE_PORT,
  backendUri: import.meta.env.VITE_BACKEND_URI,

  docus: {
    title: "Hackbox Docs",
    description:
      "Documentation for integrating with Hackbox - a real-time multiplayer game framework",
    url: "https://docs.hackbox.ca",
    image: "/social-card.png",

    aside: {
      level: 1,
    },

    header: {
      title: "Hackbox",
      logo: false,
      navigation: [
        {
          title: "Documentation",
          to: "/docs",
        },
        {
          title: "Playground",
          to: "/playground",
        },
      ],
      links: [
        {
          icon: "lucide:github",
          to: "https://github.com/devanhurst/hackbox",
          target: "_blank",
        },
      ],
    },

    footer: {
      credits: "Built with Hackbox",
      links: [
        {
          icon: "lucide:github",
          to: "https://github.com/devanhurst/hackbox",
          target: "_blank",
        },
      ],
    },
  },
});
