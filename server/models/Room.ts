import { and, eq, inArray } from "drizzle-orm";
import { db, members, rooms } from "../db";
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
  return [1, 2, 3, 4].map(() => consonants[Math.floor(Math.random() * consonants.length)]).join("");
};

export class Room {
  code: string;
  hostId: string;
  twitchRequired: boolean;
  closed: boolean;

  static async find(roomCode: string): Promise<Room | null> {
    const room = await db.query.rooms.findFirst({
      where: { code: roomCode },
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
        .insert(rooms)
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

  async getMemberIds(userIds?: string[]) {
    const where = userIds
      ? and(eq(members.roomCode, this.code), inArray(members.userId, userIds))
      : eq(members.roomCode, this.code);

    const result = await db.select({ id: members.id }).from(members).where(where);

    return result.map((r) => r.id);
  }

  async getMembers(userIds?: string[]) {
    const where = userIds
      ? and(eq(members.roomCode, this.code), inArray(members.userId, userIds))
      : eq(members.roomCode, this.code);

    const result = await db
      .select({
        id: members.id,
        userId: members.userId,
        userName: members.userName,
        online: members.online,
        metadata: members.metadata,
      })
      .from(members)
      .where(where);

    return result.map((r) => new Member(r));
  }
}
