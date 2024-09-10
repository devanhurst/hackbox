import { eq, and } from "drizzle-orm";
import db, { members, SavedMember, InsertMemberInput } from "./db";
import { defaultMemberState } from "../helpers";
import { MemberMetadata, MemberState } from "../types";

interface UpdateMemberInput {
  userName?: string;
  metadata?: MemberMetadata;
  state?: MemberState;
}

export const getManyForRoom = async (roomCode: string) => {
  return db.query.members.findMany({ where: eq(members.roomCode, roomCode) });
};

export const findForUserAndRoom = async ({
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

export const create = async (
  options: InsertMemberInput
): Promise<SavedMember> => {
  const userName = options.userName.toUpperCase();

  await db
    .insert(members)
    .values({
      ...options,
      userName,
      state: defaultMemberState(userName),
    })
    .onConflictDoNothing();

  return db.query.members.findFirst({
    where: and(
      eq(members.roomCode, options.roomCode),
      eq(members.userId, options.userId)
    ),
  }) as Promise<SavedMember>;
};

export const update = async (
  id: string,
  options: UpdateMemberInput
): Promise<void> => {
  await db.update(members).set(options).where(eq(members.id, id));
};
