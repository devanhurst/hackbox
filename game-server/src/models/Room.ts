import { eq } from "drizzle-orm";
import db, { rooms, Room, NewRoom } from "../db";
import { generateRoomCode } from "../helpers/generateRoomCode";

export type RoomType = Room;
export type RoomInput = NewRoom;

export const getOne = async (code: string) =>
  db.query.rooms.findFirst({
    where: eq(rooms.code, code.toUpperCase()),
  });

export const getAll = async () => db.query.rooms.findMany();

interface CreateRoomInput {
  hostId: string;
  code?: string;
  twitchRequired?: boolean;
  persistent?: boolean;
}

export const create = async (options: CreateRoomInput): Promise<Room> => {
  const code = options.code || generateRoomCode();

  const existingRoom = await getOne(code);
  if (existingRoom) return create({ ...options, code: generateRoomCode() });

  await db
    .insert(rooms)
    .values({
      twitchRequired: false,
      persistent: false,
      ...options,
      code: code.toUpperCase(),
    })
    .onConflictDoNothing();

  const room = (await getOne(code)) as Room;
  return room;
};
