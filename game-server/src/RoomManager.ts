import { Server, Socket } from "socket.io";
import Room from "./Room";
import Host from "./Host";
import { authenticateWithTwitch } from "./helpers/twitch";
import { MemberMetadata } from "./Member";

export interface HandshakeMetadata {
  twitchAccessToken?: string;
}

const RESERVED_ROOMS = [
  {
    roomCode: "DREW",
    hostId: "219e1ece-3b83-4586-bd3a-bab543463dff",
  },
];

class RoomManager {
  io: Server | null;
  rooms: Map<string, Room>;

  constructor() {
    this.io = null;
    this.rooms = new Map<string, Room>();
    this.createReservedRooms();
  }

  createReservedRooms = () => {
    RESERVED_ROOMS.forEach((reservedRoom) => {
      this.createRoom(reservedRoom.hostId, reservedRoom.roomCode);
    });
  };

  generateRoomCode = () => {
    const consonants = [
      "B",
      "C",
      "D",
      "F",
      "G",
      "H",
      "J",
      "K",
      "L",
      "M",
      "N",
      "P",
      "Q",
      "R",
      "S",
      "T",
      "V",
      "W",
      "X",
      "Z",
    ];
    return [1, 2, 3, 4]
      .map(() => consonants[Math.floor(Math.random() * consonants.length)])
      .join("");
  };

  findRoom(roomCode: string) {
    return this.rooms.get(roomCode);
  }

  createRoom(hostId: string, roomCode: string, twitchRequired = false): Room {
    const existingRoom = this.findRoom(roomCode);
    if (existingRoom) return this.createRoom(hostId, this.generateRoomCode());

    const newRoom = new Room(
      roomCode,
      new Host(hostId, roomCode),
      twitchRequired
    );

    this.rooms.set(roomCode, newRoom);
    return newRoom;
  }

  async joinRoom(
    socket: Socket,
    userId: string,
    userName: string,
    roomCode: string,
    metadata: HandshakeMetadata
  ) {
    let room = this.findRoom(roomCode);
    if (!room) {
      socket.emit("error", { message: "This room does not exist." });
      socket.disconnect(true);
      return;
    }

    const memberMetadata: MemberMetadata = {
      twitch: await authenticateWithTwitch(metadata.twitchAccessToken),
    };

    if (userId === room.host.id) {
      room.join(userId, userName, socket, memberMetadata);
      return;
    }

    if (room.twitchRequired && !memberMetadata.twitch) {
      socket.emit("error", {
        message: "Please log in with Twitch before joining this room.",
      });
      socket.disconnect(true);
      return;
    }

    room.join(userId, userName, socket, memberMetadata);
  }

  deleteRoom(roomCode: string) {
    this.rooms.delete(roomCode);
  }
}

export default new RoomManager();
