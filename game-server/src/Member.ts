import type { Socket } from "socket.io";
import roomManager from "./RoomManager";
import type { MemberState } from "../types";
import { mergeStates } from "./helpers/stateHelpers";
import { randomUUID } from "crypto";
import { TwitchMetadata } from "./helpers/twitch";
import Room from "./Room";

export interface MemberMetadata {
  twitch: TwitchMetadata | undefined;
}

class Member {
  socket: Socket | null;
  id: string;
  name: string;
  roomCode: string;
  state: MemberState;
  metadata: MemberMetadata;

  constructor(
    id: string,
    name: string,
    roomCode: string,
    metadata: MemberMetadata
  ) {
    this.id = id;
    this.name = name;
    this.roomCode = roomCode;
    this.socket = null;
    this.metadata = metadata;
    this.state = {
      version: 1,
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
          text: name,
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
    };
  }

  connect(socket: Socket) {
    this.socket = socket;

    this.socket.on("msg", (payload) => {
      const message = {
        id: randomUUID(),
        from: this.id,
        timestamp: Date.now(),
        event: payload.event,
        message: payload,
      };
      this.room.host.send("msg", message);
    });

    this.socket.on("change", (payload) => {
      const message = {
        id: randomUUID(),
        from: this.id,
        timestamp: Date.now(),
        event: payload.event,
        message: payload,
      };
      this.room.host.send("change", message);
    });

    this.sendState();
  }

  send(eventName: string, payload: unknown) {
    this.socket?.emit(eventName, payload);
  }

  sendState() {
    this.send("state.member", this.state);
  }

  updateState(newState: Partial<MemberState> = {}) {
    this.state = mergeStates(this.state, newState);
    this.state.ui.main.components = this.state.ui.main.components.map(
      (component) => ({ key: randomUUID(), ...component })
    );
    this.sendState();
  }

  get room() {
    return roomManager.findRoom(this.roomCode) as Room;
  }
}

export default Member;
