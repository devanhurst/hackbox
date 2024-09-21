import { Socket } from "socket.io";
import { RoomService } from "./RoomService";

interface RegisterHostInput {
  socket: Socket;
  roomService: RoomService;
}

export default async ({ socket, roomService }: RegisterHostInput) => {
  socket.data.type = "host";
  socket.data.userId = socket.handshake.query.userId;

  socket.on("member.update", async (payload: any) =>
    roomService.updateMemberStates({
      recipients: [payload.to].flat(),
      newState: payload.data,
    })
  );

  socket.on("reload", () => {
    roomService.sendToMembers({ event: "reload" });
  });
};
