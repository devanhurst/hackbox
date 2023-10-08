import { Socket } from "socket.io";
import Host from "./Host";
import Member, { MemberMetadata } from "./Member";
import roomManager from "./RoomManager";

class Room {
  readonly id: string;
  host: Host;
  members: { [id: string]: Member };
  readonly twitchRequired: Boolean;
  readonly createdAt: number;

  constructor(roomCode: string, host: Host, twitchRequired: Boolean) {
    this.id = roomCode;
    this.host = host;
    this.members = {};
    this.twitchRequired = twitchRequired;
    this.createdAt = Date.now();
  }

  /**
   * Returns this room's age in seconds.
   */
  age(): number {
    return (Date.now() - this.createdAt) / 1000;
  }

  join(
    userId: string,
    userName: string,
    socket: Socket,
    metadata: MemberMetadata
  ) {
    socket.join(this.id);

    let user: Host | Member;

    if (userId === this.host.id) {
      user = this.host;
    } else {
      user = this.members[userId];
      if (!user) {
        user = new Member(userId, userName, this.id, metadata);
        this.members[userId] = user;
      }
    }

    user.connect(socket);
    this.sendPrivateStateToHost();
  }

  sendPrivateStateToHost() {
    this.host.send("state.host", this.privateState);
  }

  sendEventToRoom(payload: object) {
    roomManager.io?.to(this.id).emit("event", payload);
  }

  get privateState() {
    return {
      members: Object.values(this.members).reduce(
        (acc: { [memberId: string]: object }, member) => {
          acc[member.id] = {
            id: member.id,
            name: member.name,
            metadata: member.metadata,
            twitchData: member.metadata.twitch,
          };
          return acc;
        },
        {}
      ),
    };
  }
}

export default Room;
