import type { Socket } from "socket.io";
import type { MemberState } from "../models/Member";
import type { RoomService } from "./RoomService";

interface RegisterHostInput {
  socket: Socket;
  roomService: RoomService;
}

interface HostPayload {
  to: string | string[];
  data: MemberState;
}

export default async ({ socket, roomService }: RegisterHostInput) => {
  socket.data.type = "host";
  socket.data.userId = socket.handshake.query.userId;

  socket.on("member.update", async (payload: HostPayload) =>
    roomService.updateMemberStates({
      recipients: [payload.to].flat(),
      newState: payload.data,
    }),
  );

  socket.on("reload", () => {
    roomService.sendToMembers({ event: "reload" });
  });
};
