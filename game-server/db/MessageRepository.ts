import db, { messages } from "./db";

export type SavedMessage = typeof messages.$inferSelect;
export type SavedMessageInput = typeof messages.$inferInsert;

const create = async ({
  userId,
  userName,
  roomCode,
  payload,
}: SavedMessageInput): Promise<void> => {
  await db.insert(messages).values({
    userId,
    userName,
    roomCode,
    payload,
  });
};

export default {
  create,
};
