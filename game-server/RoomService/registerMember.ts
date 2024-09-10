import { Socket } from "socket.io";
import { Member } from "../models";
import { disconnect } from "../helpers";
import { MemberState } from "../types";
import { authenticateWithTwitch } from "../lib/twitch";
import { RoomService } from "./RoomService";

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

export const registerMember = async ({
  socket,
  roomService,
}: RegisterMemberInput) => {
  if (roomService.room.closed) {
    const existingMember = await Member.find({
      userId: socket.data.userId,
      roomCode: socket.data.roomCode,
    });

    if (!existingMember) return disconnect(socket, "This room is closed.");
  }

  const { metadata } = socket.handshake.query as unknown as Handshake;
  const handshakeMetadata = (JSON.parse(metadata) as HandshakeMetadata) || {};
  const memberMetadata = {
    twitch: await authenticateWithTwitch(handshakeMetadata.twitchAccessToken),
  };

  if (roomService.room.twitchRequired && !memberMetadata.twitch) {
    return disconnect(
      socket,
      "Please log in with Twitch before joining this room."
    );
  }

  const member = await Member.create({
    roomCode: roomService.room.code,
    userId: socket.data.userId,
    userName: socket.data.userName,
  });

  roomService.updateHost();
  roomService.updateMembers({
    recipients: [socket.data.userId],
    newState: member.state,
  });

  socket.on("msg", async (payload: any) => {
    console.log(`Received message in ${roomService.room.code}`, {
      userId: socket.data.userId,
      userName: socket.data.userName,
      payload,
    });

    roomService.sendToHost({ event: "msg", payload, from: socket });
  });

  socket.on("change", async (payload: any) => {
    roomService.sendToHost({
      event: "change",
      payload,
      from: socket,
    });
  });

  socket.on("sync", async (payload: any) => {
    try {
      const { id } = payload;
      if (!socket.data.state.id) return;
      if (id === socket.data.state.id) return;

      roomService.updateMembers({
        recipients: [socket.data.userId],
        newState: socket.data.state as MemberState,
      });
    } catch {
      console.error("Error syncing member state.", payload);
    }
  });
};
