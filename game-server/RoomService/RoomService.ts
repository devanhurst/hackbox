import { Server, Socket } from "socket.io";
import { Room, Member } from "../models";
import { randomUUID } from "crypto";
import { updateMemberState } from "../helpers";

interface ConstructorProps {
  room: Room;
  server: Server;
}

export class RoomService {
  server: Server;
  room: Room;

  constructor(props: ConstructorProps) {
    this.server = props.server;
    this.room = props.room;
  }

  async getAllSockets() {
    return this.server.in(this.room.code).fetchSockets();
  }

  async getHostSocket() {
    const sockets = await this.getAllSockets();
    return sockets.find((s) => s.data.type === "host");
  }

  async getMemberSockets() {
    const sockets = await this.getAllSockets();
    return sockets.filter((s) => s.data.type === "member");
  }

  async getSocket(userId: string) {
    const sockets = await this.getMemberSockets();
    return sockets.find((s) => s.data.userId === userId);
  }

  async sendToHost({
    event,
    payload,
    from,
  }: {
    event: string;
    payload: any;
    from: Socket;
  }) {
    const host = await this.getHostSocket();
    if (!host) return;

    host.emit(event, {
      id: randomUUID(),
      from: from.data.userId,
      timestamp: Date.now(),
      event: payload.event,
      message: payload,
    });
  }

  async updateHost() {
    const hostSocket = await this.getHostSocket();
    if (!hostSocket) return;

    const members = await this.room.getMembers();
    const sockets = await this.getMemberSockets();

    const state = {
      members: members.reduce((acc: { [memberId: string]: object }, member) => {
        const metadata = (member.metadata || {}) as any;

        acc[member.userId] = {
          id: member.userId,
          name: member.userName,
          metadata,
          twitchData: metadata.twitch,
          online: !!sockets.find((s) => s.data.userId === member.userId),
        };

        return acc;
      }, {}),
    };

    hostSocket.emit("state.host", state);
  }

  async updateMembers({
    recipients,
    newState,
  }: {
    recipients: string[];
    newState: Partial<Member["state"]>;
  }): Promise<void> {
    const members = await this.room.getMembers();
    const membersToUpdate = members.filter((m) =>
      recipients.includes(m.userId)
    );

    membersToUpdate.forEach(async (member) => {
      const combinedState = updateMemberState({
        oldState: member.state,
        newState,
      });

      member.save({ state: combinedState });

      const memberSocket = await this.getSocket(member.userId);
      if (!memberSocket) return;

      memberSocket.data.state = combinedState;
      memberSocket.emit("state.member", combinedState);
    });
  }
}
