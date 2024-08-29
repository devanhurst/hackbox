import { authenticateWithTwitch } from "../helpers/twitch";
import { randomUUID } from "crypto";
import { Room, Member } from "../models";
import { getHostState } from "../helpers/stateHelpers";
import { MemberType } from "../models/Member";

interface JoinRoomInput {
  socket: any;
  userName: string;
  metadata: any;
}

export const joinRoom = async (io: any, options: JoinRoomInput) => {
  const { socket, userName, metadata } = options;
  const { roomCode, userId } = socket.data;

  const memberMetadata: Member.MemberMetadata = {
    twitch: await authenticateWithTwitch(metadata.twitchAccessToken),
  };

  const room = (await Room.getOne(roomCode)) as Room.RoomType;

  if (room.twitchRequired && !memberMetadata.twitch) {
    socket.emit("error", {
      message: "Please log in with Twitch before joining this room.",
    });
    socket.disconnect(true);
    return;
  }

  await Member.create({
    userId,
    userName,
    roomCode,
    metadata: memberMetadata,
  });

  const member = (await Member.getOneForRoomAndUser({
    userId,
    roomCode,
  })) as MemberType;

  socket.join(roomCode);
  socket.emit("state.member", member.state);

  const sendToHost = async (event: string, payload: any) => {
    const host = (await io.fetchSockets()).find(
      (s: any) => s.data.userId === room.hostId && s.data.roomCode === roomCode
    );

    if (!host) {
      console.error("The host is not connected to the room:", room.code);
      return;
    }

    host.emit(event, payload);
  };

  sendToHost("state.host", await getHostState(roomCode));

  // When a member intentionally sends a message, this message is sent.
  // Decorate it and send it to the host.
  socket.on("msg", async (payload: any) => {
    const message = {
      id: randomUUID(),
      from: socket.data.userId,
      timestamp: Date.now(),
      event: payload.event,
      message: payload,
    };

    sendToHost("msg", message);
  });

  // When a member makes a change to a frontend input, this message is sent.
  // Decorate it and send it to the host.
  socket.on("change", async (payload: any) => {
    const message = {
      id: randomUUID(),
      from: socket.data.userId,
      timestamp: Date.now(),
      event: payload.event,
      message: payload,
    };

    sendToHost("change", message);
  });
};
