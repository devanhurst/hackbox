import { eq, and } from "drizzle-orm";
import db, { members } from "./db";

export type SavedMember = typeof members.$inferSelect;
export type SavedMemberInput = typeof members.$inferInsert;

const getManyForRoom = async (roomCode: string) => {
  return db.query.members.findMany({ where: eq(members.roomCode, roomCode) });
};

const findForUserAndRoom = async ({
  userId,
  roomCode,
}: {
  userId: string;
  roomCode: string;
}) => {
  return db.query.members.findFirst({
    where: and(eq(members.userId, userId), eq(members.roomCode, roomCode)),
  });
};

const create = async (options: SavedMemberInput): Promise<SavedMember> => {
  const userName = options.userName.toUpperCase();

  await db
    .insert(members)
    .values({
      ...options,
      userName,
    })
    .onConflictDoNothing();

  return db.query.members.findFirst({
    where: and(
      eq(members.roomCode, options.roomCode),
      eq(members.userId, options.userId)
    ),
  }) as Promise<SavedMember>;
};

const update = async (
  id: string,
  options: Partial<SavedMemberInput>
): Promise<void> => {
  await db.update(members).set(options).where(eq(members.id, id));
};

export default {
  getManyForRoom,
  findForUserAndRoom,
  create,
  update,
};
