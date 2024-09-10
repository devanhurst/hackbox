import { Socket } from "socket.io";
import { RoomService } from "./RoomService";

interface RegisterHostInput {
  socket: Socket;
  roomService: RoomService;
}

export const registerHost = async ({
  socket,
  roomService,
}: RegisterHostInput) => {
  roomService.updateHost();

  socket.on("member.update", async (payload: any) =>
    roomService.updateMembers({
      recipients: payload.to,
      newState: payload.data,
    })
  );
};
