import { Socket } from "socket.io";
import { randomUUID } from "crypto";
import { Member } from "./models";

export const disconnect = (socket: Socket, message = "An error occurred.") => {
  socket.emit("error", { message });
  socket.disconnect(true);
  console.log(`Disconnected.`, message);
};

export const defaultMemberState = (userName: string) => ({
  id: randomUUID(),
  version: 2,
  theme: {
    header: {
      color: "white",
      background: "#7c2fec",
    },
    main: {
      background: "#120a20",
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
            text: "Waiting for the host to let you in...",
            align: "center",
            border: "none",
            color: "white",
            background: "transparent",
          },
        },
      ],
    },
  },
});

export const combineStates = ({
  oldState,
  newState,
}: {
  oldState: Member["state"];
  newState: Partial<Member["state"]>;
}) => {
  const combinedState = { ...oldState, id: randomUUID() };

  if (newState.version) {
    combinedState.version = newState.version;
  }
  if (newState.theme) {
    if (newState.theme.header)
      combinedState.theme.header = {
        ...oldState.theme.header,
        ...newState.theme.header,
      };
    if (newState.theme.main)
      combinedState.theme.main = {
        ...oldState.theme.main,
        ...newState.theme.main,
      };
    if (newState.theme.fonts) {
      combinedState.theme.fonts = newState.theme.fonts;
    }
  }

  if (newState.presets) {
    const oldPresets = oldState.presets || {};
    combinedState.presets = { ...oldPresets, ...newState.presets };
  }

  if (newState.ui) {
    if (newState.ui.header)
      combinedState.ui.header = {
        ...oldState.ui.header,
        ...newState.ui.header,
      };
    if (newState.ui.main)
      combinedState.ui.main = { ...oldState.ui.main, ...newState.ui.main };
  }

  combinedState.ui.main.components = combinedState.ui.main.components.map(
    (component) => ({ key: randomUUID(), ...component })
  );

  return combinedState;
};
