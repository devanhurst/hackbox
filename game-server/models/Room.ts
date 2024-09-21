import { db, schema } from "../db";
import { and, eq, inArray } from "drizzle-orm";
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

  static async find(roomCode: string): Promise<Room | null> {
    const room = await db.query.rooms.findFirst({
      where: eq(schema.rooms.code, roomCode.toUpperCase()),
    });

    if (!room) return null;
    return new Room({ ...room });
  }

  static async create(props: CreateProps): Promise<Room> {
    const code = generateRoomCode();

    const existingRoom = await Room.find(code);
    if (existingRoom) return Room.create(props);

    const newRoom = (
      await db
        .insert(schema.rooms)
        .values({ ...props, code })
        .returning()
    )[0];

    if (!newRoom) throw new Error("Failed to create room.");

    return new Room({ ...newRoom });
  }

  constructor(props: ConstructorProps) {
    this.code = props.code;
    this.hostId = props.hostId;
    this.twitchRequired = props.twitchRequired;
    this.closed = props.closed;
  }

  async getMembers(userIds?: string[]) {
    const where = userIds
      ? and(
          eq(schema.members.roomCode, this.code),
          inArray(schema.members.userId, userIds)
        )
      : eq(schema.members.roomCode, this.code);

    const result = await db.query.members.findMany({
      columns: {
        id: true,
        userId: true,
        userName: true,
        online: true,
        metadata: true,
      },
      where,
    });

    return result.map((r) => new Member(r));
  }
}
