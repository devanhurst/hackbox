import type { Socket } from "socket.io";
import roomManager from "./RoomManager";

const forAllRecipients = (
  recipients: any,
  callback: (recipientId: string) => void
) => {
  return Promise.allSettled([recipients].flat().map(callback));
};

class Host {
  id: string;
  roomCode: string;
  socket: Socket | undefined;

  constructor(id: string, roomCode: string) {
    this.id = id;
    this.roomCode = roomCode;
  }

  connect(socket: Socket) {
    this.socket = socket;

    socket.on("member.update", async (payload) => {
      await forAllRecipients(payload.to, (recipientId) => {
        const player = this.room.members[recipientId];
        player?.updateState(payload.data);
      });
      this.room.lastActivity = Date.now();
    });

    socket.on("event", async (payload) => {
      this.room.sendEventToRoom(payload);
      this.room.lastActivity = Date.now();
    });
  }

  send(eventName: string, payload: unknown) {
    this.socket?.emit(eventName, payload);
    this.room.lastActivity = Date.now();
  }

  get room() {
    return roomManager.findRoom(this.roomCode);
  }
}

export default Host;
