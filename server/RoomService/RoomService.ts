import type { Server, Socket } from "socket.io";
import { defaultMemberState, disconnect, sanitizeState } from "../helpers";
import { Member, Room } from "../models";
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

    void socket.join(this.room.code);
    void this.updateHostState();
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
      return disconnect(socket, "Please log in with Twitch before joining this room.");
    }

    const member =
      existingMember ||
      (await Member.create({
        roomCode: this.room.code,
        userId: socket.data.userId,
        userName: socket.data.userName,
        online: true,
        metadata: socket.data.metadata,
        state: sanitizeState(defaultMemberState(socket.data.userName)),
      }));

    const sockets = await this.getMemberSockets();

    sockets
      .filter((s) => s.data.userId === socket.data.userId)
      .forEach((s) => {
        disconnect(s as unknown as Socket, "You have connected from another device.");
      });

    void this.updateMemberStates({
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

  async sendToHost({ event, payload }: { event: string; payload?: unknown }) {
    const hosts = await this.getHostSockets();
    const newestHost = hosts[hosts.length - 1];
    if (!newestHost) return;

    newestHost.emit(event, payload);
  }

  async sendToMembers({ event, payload }: { event: string; payload?: unknown }) {
    const members = await this.getMemberSockets();
    members.forEach((member) => {
      member.emit(event, payload);
    });
  }

  async updateHostState() {
    const members = await this.room.getMembers();
    const memberSockets = await this.getMemberSockets();

    const state = {
      members: members.reduce((acc: { [memberId: string]: object }, member) => {
        const metadata = member.metadata || {};

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
    hostSockets.forEach((host) => {
      host.emit("state.host", state);
    });
  }

  async updateMemberStates({
    recipients,
    newState,
  }: {
    recipients: string[];
    newState: Member["state"];
  }): Promise<void> {
    const memberIds = await this.room.getMemberIds(recipients);
    const members = await Member.findMany(memberIds);
    const memberSockets = await this.getMemberSockets();

    members.forEach(async (member) => {
      const state = sanitizeState(newState);

      void member.save({ state });

      const memberSocket = memberSockets.find((s) => s.data.userId === member.userId);

      if (!memberSocket) return;

      memberSocket.data.state = state;
      memberSocket.emit("state.member", state);
    });
  }
}
