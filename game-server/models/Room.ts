import RoomRepository, { SavedRoom } from "../db/RoomRepository";
import MemberRepository from "../db/MemberRepository";
import { Member } from "./Member";

interface CreateProps {
  hostId: string;
  twitchRequired: boolean;
}

interface ConstructorProps extends CreateProps {
  code: string;
  closed: boolean;
}

export const generateRoomCode = () => {
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

export class Room {
  code: string;
  hostId: string;
  twitchRequired: boolean;
  closed: boolean;

  static fromDatabaseResult(result: SavedRoom) {
    return new Room({
      code: result.code,
      hostId: result.hostId,
      twitchRequired: result.twitchRequired,
      closed: result.closed,
    });
  }

  static async find(roomCode: string): Promise<Room | null> {
    const room = await RoomRepository.getOne(roomCode);
    return room ? Room.fromDatabaseResult(room) : null;
  }

  static async create(props: CreateProps): Promise<Room> {
    const code = generateRoomCode();

    const existingRoom = await Room.find(code);
    if (existingRoom) return Room.create(props);

    await RoomRepository.create({ code, ...props });
    return Room.find(code) as Promise<Room>;
  }

  constructor(props: ConstructorProps) {
    this.code = props.code;
    this.hostId = props.hostId;
    this.twitchRequired = props.twitchRequired;
    this.closed = props.closed;
  }

  async getMembers() {
    const members = await MemberRepository.getManyForRoom(this.code);
    return members.map((m) => Member.fromDatabaseResult(m));
  }
}
