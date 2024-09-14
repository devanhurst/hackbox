import { Server, Socket } from "socket.io";
import { Room, Member } from "../models";
import { RoomService } from "./RoomService";
import { disconnect, defaultMemberState } from "../helpers";
import { initializeHostSocket, initializeMemberSocket } from "../sockets";

const joinAsHost = async ({
  socket,
  roomService,
}: {
  socket: Socket;
  roomService: RoomService;
}) => {
  await initializeHostSocket({ socket, roomService });

  roomService.joinRoom(socket);
  roomService.updateHostState();
};

const joinAsMember = async ({
  socket,
  roomService,
}: {
  socket: Socket;
  roomService: RoomService;
}) => {
  await initializeMemberSocket({ socket, roomService });

  const existingMember = await Member.find({
    userId: socket.data.userId,
    roomCode: roomService.room.code,
  });

  if (existingMember) {
    await existingMember.save({ online: true, metadata: socket.data.metadata });
  }

  if (roomService.room.closed && !existingMember) {
    return disconnect(socket, "This room is closed.");
  }

  if (roomService.room.twitchRequired && !socket.data.metadata.twitch) {
    return disconnect(
      socket,
      "Please log in with Twitch before joining this room."
    );
  }

  const member =
    existingMember ||
    (await Member.create({
      roomCode: roomService.room.code,
      userId: socket.data.userId,
      userName: socket.data.userName,
      online: true,
      metadata: socket.data.metadata,
      state: defaultMemberState(socket.data.userName),
    }));

  roomService.joinRoom(socket);
  roomService.updateMemberStates({
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

  const roomService = new RoomService({ room, server });

  return userId === room.hostId
    ? joinAsHost({ socket, roomService })
    : joinAsMember({ socket, roomService });
};
