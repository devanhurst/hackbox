import { Socket } from "socket.io";
import { randomUUID } from "crypto";
import { Member } from "./models";
import deepmerge from "@fastify/deepmerge";

export const disconnect = (socket: Socket, message = "An error occurred.") => {
  socket.emit("error", { message });
  socket.disconnect(true);
};

const emptyMemberState = () => ({
  theme: {
    header: {
      color: "#EEE",
      background: "#222",
      fontFamily: "Fredoka One",
    },
    main: {
      background: "#111",
    },
  },
  ui: {
    header: {
      text: "",
    },
    main: {
      align: "start" as "start",
      components: [],
    },
  },
});

export const defaultMemberState = (userName: string) => ({
  ui: {
    header: {
      text: userName,
    },
    main: {
      components: [
        {
          type: "Text",
          props: {
            text: "Hang tight!<br /><br />We're waiting for the host to let you in.",
            style: {
              align: "center",
              border: "none",
              color: "#EEE",
              background: "transparent",
              fontSize: "1.5rem",
              fontFamily: "Fredoka One",
            },
          },
        },
      ],
    },
  },
});

export const sanitizeState = (state: Member["state"]) => {
  const newState = deepmerge()(emptyMemberState(), state ?? {});
  const randomId = randomUUID().substring(0, 3);

  newState.ui.main.components = newState.ui.main.components.map((c, index) => ({
    key: `${randomId}-${index}`,
    ...c,
  }));

  return newState;
};
