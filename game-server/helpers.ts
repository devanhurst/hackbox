import { Socket } from "socket.io";
import { randomUUID } from "crypto";
import { Member } from "./models";
import mergeWith from "lodash/mergeWith";

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

export const combineStates = ({
  oldState,
  newState,
}: {
  oldState: Member["state"];
  newState: Partial<Member["state"]>;
}) => {
  const combinedState = mergeWith(oldState, newState, (_, newValue) =>
    Array.isArray(newValue) ? newValue : undefined
  );

  const randomId = randomUUID().substring(0, 3);

  combinedState.ui.main.components = combinedState.ui.main.components.map(
    (component, index) => ({ key: `${randomId}-${index}`, ...component })
  );

  return combinedState;
};
