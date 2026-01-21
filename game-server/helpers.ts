import { Socket } from "socket.io";
import { randomUUID } from "crypto";
import { Member } from "./models";

export const disconnect = (socket: Socket, message = "An error occurred.") => {
  socket.emit("error", { message });
  socket.disconnect(true);
};

export const defaultMemberState = (userName: string) => ({
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
      text: userName,
    },
    main: {
      align: "start" as "start",
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
  const randomId = randomUUID().substring(0, 3);

  const newComponents = state?.ui?.main?.components ?? [];
  state.ui.main.components = newComponents.map((c, index) => ({
    key: `${randomId}-${index}`,
    ...c,
  }));

  return {
    ui: state.ui,
    theme: state.theme,
    presets: state.presets,
  };
};
