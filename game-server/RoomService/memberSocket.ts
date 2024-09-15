import { Socket } from "socket.io";
import { Member } from "../models";
import { authenticateWithTwitch } from "../lib/twitch";
import { RoomService } from "./RoomService";
import MessageRepository from "../db/MessageRepository";
import { randomUUID } from "crypto";

interface RegisterMemberInput {
  socket: Socket;
  roomService: RoomService;
}

interface Handshake {
  userId: string;
  userName: string;
  roomCode: string;
  metadata: string;
}

interface HandshakeMetadata {
  twitchAccessToken?: string;
}

export default async ({ socket, roomService }: RegisterMemberInput) => {
  const handshake = socket.handshake.query as unknown as Handshake;
  const handshakeMetadata =
    (JSON.parse(handshake.metadata) as HandshakeMetadata) || {};
  const metadata = {
    twitch: await authenticateWithTwitch(handshakeMetadata.twitchAccessToken),
  };

  socket.data = {
    type: "member",
    userId: handshake.userId,
    userName: handshake.userName,
    metadata,
    state: {},
  };

  socket.on("msg", async (payload: any) => {
    roomService.sendToHost({
      event: "msg",
      payload: {
        from: socket.data.userId,
        event: payload.event,
        message: payload,
        timestamp: Date.now(),
      },
    });

    MessageRepository.create({
      userId: socket.data.userId,
      userName: socket.data.userName,
      roomCode: roomService.room.code,
      payload: payload,
    });
  });

  socket.on("change", async (payload: any) => {
    roomService.sendToHost({
      event: "change",
      payload: {
        from: socket.data.userId,
        event: payload.event,
        message: payload,
        timestamp: Date.now(),
      },
    });
  });

  socket.on("sync", async (payload: any) => {
    try {
      const { id } = payload;
      if (!socket.data.state.id) return;
      if (id === socket.data.state.id) return;

      roomService.updateMemberStates({
        recipients: [socket.data.userId],
        newState: socket.data.state as Member["state"],
      });
    } catch {
      console.error("Error syncing member state.", payload);
    }
  });

  socket.on("disconnect", async () => {
    const member = await Member.find({
      userId: socket.data.userId,
      roomCode: roomService.room.code,
    });

    if (member) await member.save({ online: false });

    roomService.updateHostState();
  });
};
