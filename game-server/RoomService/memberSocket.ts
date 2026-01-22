import type { Socket } from "socket.io";
import { authenticateWithTwitch } from "../lib/twitch";
import { Member } from "../models";
import type { RoomService } from "./RoomService";

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
  value: unknown;
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

socket.on("msg", async (payload: MemberPayload) => {
  roomService.sendToHost({
    event: "msg",
    payload: {
      from: socket.data.userId,
      event: payload.event,
      message: payload,
      timestamp: Date.now(),
    },
  });

  console.log(
    `[${roomService.room.code}] ${socket.data.userName}: ${payload.value} (${payload.event})`,
  );
});

socket.on("change", async (payload: MemberPayload) => {
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

socket.on("disconnect", async () => {
  const member = await Member.find({
    userId: socket.data.userId,
    roomCode: roomService.room.code,
  });

  if (member) await member.save({ online: false });

  roomService.updateHostState();
});
};
