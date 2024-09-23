import config from "@/config";
import { io, Socket } from "socket.io-client";
import { reactive } from "vue";
import type { Router } from "vue-router";
import type { PlayerState, PlayerStatePayload } from "@/types";
import {
  getUserId,
  getUserName,
  getRoomCode,
  getTwitchAccessToken,
} from "@/lib/browserStorage";
import { expandStatePresets, processFonts } from "../stateHelpers";
import mergeWith from "lodash/mergeWith";

const baseState: PlayerState = {
  theme: {
    header: {
      color: "black",
      background: "black",
      minHeight: "50px",
      maxHeight: "50px",
    },
    main: {
      background: "black",
      minWidth: "300px",
      maxWidth: "350px",
    },
  },
  ui: {
    header: {
      text: "",
    },
    main: {
      align: "start",
      components: [],
    },
  },
};

const attachPlayerEvents = (
  socket: Socket,
  state: PlayerState,
  router: Router
) => {
  socket.on("disconnect", (reason: string) => {
    const reconnectReasons = [
      "ping timeout",
      "transport close",
      "transport error",
    ];
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
    processFonts(payload);
    expandStatePresets(payload);

    const newState = mergeWith(state, payload, (_, newValue) =>
      Array.isArray(newValue) ? newValue : undefined
    );

    state.theme = newState.theme;
    state.ui = newState.ui;
  });
};

const initializePlayerSocket = (router: Router) => {
  const socket = io(config.backendUri, {
    query: {
      userId: getUserId(),
      userName: getUserName(),
      roomCode: getRoomCode(),
      metadata: JSON.stringify({
        twitchAccessToken: getTwitchAccessToken(),
      }),
    },
  });

  const state = reactive<PlayerState>(baseState);

  attachPlayerEvents(socket, state, router);

  return { socket, state };
};

export default initializePlayerSocket;
