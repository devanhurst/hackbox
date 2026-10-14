import { createRouter, type RouterHistory } from "vue-router";
import LobbyView from "../views/LobbyView.vue";
import { setTwitchAccessToken } from "@/lib/browserStorage";

export function createAppRouter(history: RouterHistory) {
  const router = createRouter({
    history,
    routes: [
      {
        path: "/",
        name: "lobby",
        component: LobbyView,
      },
      {
        path: "/play",
        name: "play",
        component: () => import("../views/PlayerView.vue"),
      },
      {
        path: "/twitch-auth-callback",
        name: "twitch-auth-callback",
        component: () => {},
        beforeEnter: async (to) => {
          const hash = new URLSearchParams(to.hash.substring(1));
          const accessToken = hash.get("access_token");

          if (accessToken) {
            setTwitchAccessToken(accessToken);
          }

          router.push("/");
        },
      },
      { path: "/:pathMatch(.*)*", redirect: "/" },
    ],
  });

  return router;
}
