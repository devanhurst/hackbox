import type { Socket } from "socket.io";
import { authenticateWithTwitch } from "../lib/twitch";
import { Member } from "../models";
import type { RoomService } from "./RoomService";
import * as Sentry from "@sentry/node";

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

interface MemberPayload {
  event: string;
  value: string;
}

export default async ({ socket, roomService }: RegisterMemberInput) => {
  const handshake = socket.handshake.query as unknown as Handshake;
  const handshakeMetadata = (JSON.parse(handshake.metadata) as HandshakeMetadata) || {};
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

  socket.on("msg", async (payload: MemberPayload) => {
    const message = {
      event: "msg",
      payload: {
        from: socket.data.userId,
        event: payload.event,
        message: payload,
        timestamp: Date.now(),
      },
    };

    await roomService.sendToHost(message);

    Sentry.logger.info(
      `[${roomService.room.code}] ${socket.data.userName} sent [${payload.event}] ${payload.value}`,
      {
        roomCode: roomService.room.code,
        userName: socket.data.userName,
        message,
      },
    );
  });

  socket.on("change", async (payload: MemberPayload) => {
    const message = {
      event: "change",
      payload: {
        from: socket.data.userId,
        event: payload.event,
        message: payload,
        timestamp: Date.now(),
      },
    };

    await roomService.sendToHost(message);
  });

  socket.on("disconnect", async () => {
    const member = await Member.find({
      userId: socket.data.userId,
      roomCode: roomService.room.code,
    });

    if (member) await member.save({ online: false });

    await roomService.updateHostState();
  });
};
