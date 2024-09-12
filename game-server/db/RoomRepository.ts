import { eq } from "drizzle-orm";
import db, { rooms } from "./db";

export type SavedRoom = typeof rooms.$inferSelect;
export type SavedRoomInput = typeof rooms.$inferInsert;

const getOne = async (code: string) =>
  db.query.rooms.findFirst({
    where: eq(rooms.code, code.toUpperCase()),
  });

const getAll = async () => db.query.rooms.findMany();

const create = async (
  options: SavedRoomInput
): Promise<SavedRoom | undefined> => {
  await db.insert(rooms).values(options);

  return db.query.rooms.findFirst({
    where: eq(rooms.code, options.code),
  });
};

export default {
  getOne,
  getAll,
  create,
};
