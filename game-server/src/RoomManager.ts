import { Server, Socket } from "socket.io";
import Room from "./Room";
import Host from "./Host";
import { authenticateWithTwitch } from "./helpers/twitch";
import { MemberMetadata } from "./Member";
import { CronJob } from 'cron';

export interface HandshakeMetadata {
  twitchAccessToken?: string;
}

class RoomManager {
  io: Server | null;
  rooms: { [roomCode: string]: Room };

  constructor() {
    this.io = null;
    this.rooms = {};

    const job = new CronJob(
      '0 0 */1 * * *',
      () => {
        this.removeOldRooms();
      },
      null,
      true,
    );
  }

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
    return this.rooms[roomCode];
  }

  createRoom(hostId: string, roomCode: string, twitchRequired = false): Room {
    const existingRoom = this.findRoom(roomCode);
    if (existingRoom) return this.createRoom(hostId, this.generateRoomCode());

    const newRoom = new Room(
      roomCode,
      new Host(hostId, roomCode),
      twitchRequired
    );
    this.rooms[roomCode] = newRoom;
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

  removeOldRooms() {
    const HOUR_IN_SECONDS = 60 * 60; // readability purposes only
    const DELETION_TIME = process.env.ROOM_DELETION_TIME_HOURS * HOUR_IN_SECONDS;

    for (const room of Object.values(this.rooms)) {
      if (room.timeSinceLastActivity() >= DELETION_TIME) {
        console.log(`Deleted room with ID ${room.id}`);
        delete this.rooms[room.id];
      }
    }
  }
}

export default new RoomManager();
