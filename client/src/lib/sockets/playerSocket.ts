import config from "@/config";
import { createHackboxSocket, type HackboxSocket } from "@/lib/sockets/hackboxSocket";
import { reactive } from "vue";
import type { Router } from "vue-router";
import type { PlayerState, PlayerStatePayload } from "@/types";
import { getUserId, getUserName, getRoomCode, getTwitchAccessToken } from "@/lib/browserStorage";
import { expandStatePresets, processFonts } from "../stateHelpers";
import merge from "lodash/merge";
import cloneDeep from "lodash/cloneDeep";

const stateSkeleton = {
  theme: {
    header: {},
    main: {},
  },
  ui: {
    header: {},
    main: {},
  },
};

const attachPlayerEvents = (socket: HackboxSocket, state: PlayerState, router: Router) => {
  // The SDK splits disconnects into transient reasons (it reconnects under the
  // hood) vs terminal ones (room gone/closed/expired, duplicate device) that
  // should send the player home.
  socket.on("disconnect", (reason) => {
    const reconnectReasons = ["ping timeout", "transport close", "transport error"];
    if (reconnectReasons.includes(reason as string)) return;
    router.push("/");
  });

  socket.on("error", (payload) => {
    alert((payload as { message: string }).message);
  });

  socket.on("reload", () => {
    location.reload();
  });

  socket.on("state.member", (payload) => {
    const newState = merge(cloneDeep(stateSkeleton), payload as PlayerStatePayload);

    processFonts(newState);
    expandStatePresets(newState);

    state.theme = newState.theme;
    state.ui = newState.ui;
  });
};

const initializePlayerSocket = (router: Router) => {
  const common = {
    roomCode: getRoomCode(),
    userId: getUserId(),
    userName: getUserName(),
    metadata: {
      twitchAccessToken: getTwitchAccessToken(),
    },
  };

  const socket: HackboxSocket = createHackboxSocket({ host: config.relayHost, ...common });

  const state = reactive<PlayerState>(cloneDeep(stateSkeleton) as PlayerState);

  attachPlayerEvents(socket, state, router);

  return { socket, state };
};

export default initializePlayerSocket;
