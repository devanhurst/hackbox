import { Server, Socket } from "socket.io";
import { Room, Member } from "../models";
import { defaultMemberState, disconnect, combineStates } from "../helpers";
import initializeHostSocket from "./hostSocket";
import initializeMemberSocket from "./memberSocket";

interface ConstructorProps {
  room: Room;
  server: Server;
}

export class RoomService {
  server: Server;
  room: Room;

  static async join(socket: Socket, server: Server) {
    try {
      const { roomCode } = socket.handshake.query;

      const room = await Room.find(roomCode as string);
      if (!room) return disconnect(socket, "This room does not exist.");

      const roomService = new RoomService({ room, server });
      await roomService.joinRoom(socket);
    } catch (e) {
      console.error("Failed to join room.", e);
    }
  }

  constructor(props: ConstructorProps) {
    this.server = props.server;
    this.room = props.room;
  }

  async joinRoom(socket: Socket) {
    const { userId } = socket.handshake.query;

    if (userId === this.room.hostId) {
      await this.joinAsHost(socket);
    } else {
      await this.joinAsMember(socket);
    }

    socket.join(this.room.code);
    this.updateHostState();
  }

  async joinAsHost(socket: Socket) {
    await initializeHostSocket({ socket, roomService: this });
  }

  async joinAsMember(socket: Socket) {
    await initializeMemberSocket({ socket, roomService: this });

    const existingMember = await Member.find({
      userId: socket.data.userId,
      roomCode: this.room.code,
    });

    if (existingMember) {
      await existingMember.save({
        online: true,
        metadata: socket.data.metadata,
      });
    }

    if (this.room.closed && !existingMember) {
      return disconnect(socket, "This room is closed.");
    }

    if (this.room.twitchRequired && !socket.data.metadata.twitch) {
      return disconnect(
        socket,
        "Please log in with Twitch before joining this room."
      );
    }

    const member =
      existingMember ||
      (await Member.create({
        roomCode: this.room.code,
        userId: socket.data.userId,
        userName: socket.data.userName,
        online: true,
        metadata: socket.data.metadata,
        state: defaultMemberState(socket.data.userName),
      }));

    (await this.getMemberSockets())
      .filter((s) => s.data.userId === socket.data.userId)
      .forEach((s) =>
        disconnect(
          s as unknown as Socket,
          "You have connected from another device."
        )
      );

    this.updateMemberStates({
      recipients: [socket.data.userId],
      newState: member.state,
    });
  }

  async getHostSockets() {
    const sockets = await this.server.in(this.room.code).fetchSockets();
    return sockets.filter((s) => s.data.type === "host");
  }

  async getMemberSockets() {
    const sockets = await this.server.in(this.room.code).fetchSockets();
    return sockets.filter((s) => s.data.type === "member");
  }

  async sendToHost({ event, payload }: { event: string; payload?: any }) {
    const hosts = await this.getHostSockets();
    hosts.forEach((host) => host.emit(event, payload));
  }

  async sendToMembers({ event, payload }: { event: string; payload?: any }) {
    const members = await this.getMemberSockets();
    members.forEach((member) => member.emit(event, payload));
  }

  async updateHostState() {
    const members = await this.room.getMembers();
    const memberSockets = await this.getMemberSockets();

    const state = {
      members: members.reduce((acc: { [memberId: string]: object }, member) => {
        const metadata = (member.metadata || {}) as any;

        acc[member.userId] = {
          id: member.userId,
          name: member.userName,
          online: !!memberSockets.find((s) => s.data.userId === member.userId),
          metadata,
          twitchData: metadata.twitch,
        };

        return acc;
      }, {}),
    };

    const hostSockets = await this.getHostSockets();
    hostSockets.forEach((host) => host.emit("state.host", state));
  }

  async updateMemberStates({
    recipients,
    newState,
  }: {
    recipients: string[];
    newState: Partial<Member["state"]>;
  }): Promise<void> {
    const memberIds = await this.room.getMemberIds(recipients);
    const members = await Member.findMany(memberIds);
    const memberSockets = await this.getMemberSockets();

    members.forEach(async (member) => {
      const combinedState = combineStates({
        oldState: member.state,
        newState,
      });

      member.save({ state: combinedState });

      const memberSocket = memberSockets.find(
        (s) => s.data.userId === member.userId
      );

      if (!memberSocket) return;

      memberSocket.data.state = combinedState;
      memberSocket.emit("state.member", combinedState);
    });
  }
}
