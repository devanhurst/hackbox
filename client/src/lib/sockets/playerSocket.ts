import config from "@/config";
import { io, Socket } from "socket.io-client";
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

const attachPlayerEvents = (socket: Socket, state: PlayerState, router: Router) => {
  socket.on("disconnect", (reason: string) => {
    const reconnectReasons = ["ping timeout", "transport close", "transport error"];
    if (reconnectReasons.includes(reason)) return;
    router.push("/");
  });

  socket.on("error", (payload: { message: string }) => {
    alert(payload.message);
  });

  socket.on("reload", () => {
    location.reload();
  });

  socket.on("state.member", (payload: PlayerStatePayload) => {
    const newState = merge(cloneDeep(stateSkeleton), payload);

    processFonts(newState);
    expandStatePresets(newState);

    state.theme = newState.theme;
    state.ui = newState.ui;
  });
};

const initializePlayerSocket = (router: Router) => {
  const socket = io(config.serverUrl, {
    query: {
      userId: getUserId(),
      userName: getUserName(),
      roomCode: getRoomCode(),
      metadata: JSON.stringify({
        twitchAccessToken: getTwitchAccessToken(),
      }),
    },
  });

  const state = reactive<PlayerState>(cloneDeep(stateSkeleton) as PlayerState);

  attachPlayerEvents(socket, state, router);

  return { socket, state };
};

export default initializePlayerSocket;
