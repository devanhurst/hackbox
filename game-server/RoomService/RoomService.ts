import { Server, Socket } from "socket.io";
import { Room } from "../models";
import { randomUUID } from "crypto";
import { MemberState } from "../types";

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

  async getRoomSockets() {
    return this.server.in(this.room.code).fetchSockets();
  }

  async getHostSocket() {
    const sockets = await this.getRoomSockets();
    return sockets.find((s) => s.data.userId === this.room.hostId);
  }

  async getMemberSocket(userId: string) {
    const sockets = await this.getRoomSockets();
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
    const state = {
      members: members.reduce((acc: { [memberId: string]: object }, member) => {
        const metadata = (member.metadata || {}) as any;

        acc[member.userId] = {
          id: member.userId,
          name: member.userName,
          metadata,
          twitchData: metadata.twitch,
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
    newState: Partial<MemberState>;
  }): Promise<void> {
    const members = await this.room.getMembers();
    const membersToUpdate = members.filter((m) =>
      recipients.includes(m.userId)
    );

    membersToUpdate.forEach(async (member) => {
      const oldState = member.state as MemberState;
      const combinedState = { ...oldState, id: randomUUID() };

      if (newState.version) {
        combinedState.version = newState.version;
      }
      if (newState.theme) {
        if (newState.theme.header)
          combinedState.theme.header = {
            ...oldState.theme.header,
            ...newState.theme.header,
          };
        if (newState.theme.main)
          combinedState.theme.main = {
            ...oldState.theme.main,
            ...newState.theme.main,
          };
        if (newState.theme.fonts) {
          combinedState.theme.fonts = newState.theme.fonts;
        }
      }

      if (newState.presets) {
        const oldPresets = oldState.presets || {};
        combinedState.presets = { ...oldPresets, ...newState.presets };
      }

      if (newState.ui) {
        if (newState.ui.header)
          combinedState.ui.header = {
            ...oldState.ui.header,
            ...newState.ui.header,
          };
        if (newState.ui.main)
          combinedState.ui.main = { ...oldState.ui.main, ...newState.ui.main };
      }

      combinedState.ui.main.components = combinedState.ui.main.components.map(
        (component) => ({ key: randomUUID(), ...component })
      );

      member.save({ state: combinedState });

      const memberSocket = await this.getMemberSocket(member.userId);
      if (!memberSocket) return;

      memberSocket.data.state = combinedState;
      memberSocket.emit("state.member", combinedState);
    });
  }
}
