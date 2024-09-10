import { eq } from "drizzle-orm";
import db, { rooms, SavedRoom, InsertRoomInput } from "./db";

export const getOne = async (code: string) =>
  db.query.rooms.findFirst({
    where: eq(rooms.code, code.toUpperCase()),
  });

export const getAll = async () => db.query.rooms.findMany();

export const create = async (
  options: InsertRoomInput
): Promise<SavedRoom | undefined> => {
  await db.insert(rooms).values(options);

  return db.query.rooms.findFirst({
    where: eq(rooms.code, options.code),
  });
};
