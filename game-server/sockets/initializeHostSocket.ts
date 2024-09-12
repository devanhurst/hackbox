import { Socket } from "socket.io";
import { RoomService } from "../RoomService/RoomService";

interface RegisterHostInput {
  socket: Socket;
  roomService: RoomService;
}

export const initializeHostSocket = async ({
  socket,
  roomService,
}: RegisterHostInput) => {
  socket.data.type = "host";
  socket.data.userId = socket.handshake.query.userId;

  socket.on("member.update", async (payload: any) =>
    roomService.updateMembers({
      recipients: payload.to,
      newState: payload.data,
    })
  );
};
