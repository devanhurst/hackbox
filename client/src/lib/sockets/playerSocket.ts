import config from "@/config";
import PartySocket from "partysocket";
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

export const emit = (socket: PartySocket, type: string, payload?: unknown) => {
  socket.send(JSON.stringify({ type, payload }));
};

const attachPlayerEvents = (socket: PartySocket, state: PlayerState, router: Router) => {
  socket.addEventListener("close", (event) => {
    // PartySocket auto-reconnects by default.
    // If closed with a custom code (4000+), it was intentional — navigate away.
    if (event.code >= 4000) {
      router.push("/");
    }
  });

  socket.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);

    switch (data.type) {
      case "error":
        alert(data.payload.message);
        break;

      case "reload":
        location.reload();
        break;

      case "state.member": {
        const payload = data.payload as PlayerStatePayload;
        const newState = merge(cloneDeep(stateSkeleton), payload);

        processFonts(newState);
        expandStatePresets(newState);

        state.theme = newState.theme;
        state.ui = newState.ui;
        break;
      }
    }
  });
};

const initializePlayerSocket = (router: Router) => {
  const socket = new PartySocket({
    host: config.partyHost,
    party: "hackboxparty",
    room: getRoomCode(),
    query: {
      userId: getUserId(),
      userName: getUserName(),
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
