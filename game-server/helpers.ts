import { Socket } from "socket.io";

export const disconnect = (socket: Socket, message = "An error occurred.") => {
  socket.emit("error", { message });
  socket.disconnect(true);
};

export const defaultMemberState = (userName: string) => ({
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
