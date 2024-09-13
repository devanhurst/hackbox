import { Server, Socket } from "socket.io";
import { Room, Member } from "../models";
import { RoomService } from "./RoomService";
import { disconnect, defaultMemberState } from "../helpers";
import { initializeHostSocket, initializeMemberSocket } from "../sockets";

const joinAsHost = async ({
  socket,
  server,
  room,
}: {
  socket: Socket;
  server: Server;
  room: Room;
}) => {
  const roomService = new RoomService({ room, server });
  await initializeHostSocket({ socket, roomService });

  socket.join(room.code);
  roomService.updateHost();
};

const joinAsMember = async ({
  socket,
  server,
  room,
}: {
  socket: Socket;
  server: Server;
  room: Room;
}) => {
  const roomService = new RoomService({ room, server });
  await initializeMemberSocket({ socket, roomService });

  const existingMember = await Member.find({
    userId: socket.data.userId,
    roomCode: room.code,
  });

  if (existingMember) {
    await existingMember.save({ online: true, metadata: socket.data.metadata });
  }

  if (room.closed && !existingMember) {
    disconnect(socket, "This room is closed.");
  }

  if (room.twitchRequired && !socket.data.metadata.twitch) {
    disconnect(socket, "Please log in with Twitch before joining this room.");
  }

  socket.join(room.code);

  const member =
    existingMember ||
    (await Member.create({
      roomCode: room.code,
      userId: socket.data.userId,
      userName: socket.data.userName,
      online: true,
      metadata: socket.data.metadata,
      state: defaultMemberState(socket.data.userName),
    }));

  roomService.updateHost();
  roomService.updateMembers({
    recipients: [socket.data.userId],
    newState: member.state,
  });
};

export const joinRoom = async ({
  socket,
  server,
}: {
  socket: Socket;
  server: Server;
}) => {
  const { roomCode, userId } = socket.handshake.query;

  const room = await Room.find(roomCode as string);
  if (!room) return disconnect(socket, "This room does not exist.");

  return userId === room.hostId
    ? joinAsHost({ socket, server, room })
    : joinAsMember({ socket, server, room });
};
