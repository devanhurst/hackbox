import { eq, and, inArray, SQL, sql } from "drizzle-orm";
import db, { members, Member, NewMember } from "../db";
import { TwitchMetadata } from "../helpers/twitch";

export type MemberType = Member;
export type MemberInput = NewMember;

export interface MemberMetadata {
  twitch: TwitchMetadata | undefined;
}

const getDefaultState = (userName: string) => ({
  version: 2,
  theme: {
    header: {
      color: "white",
      background: "#7c2fec",
    },
    main: {
      background: "#120a20",
    },
  },
  ui: {
    header: {
      text: userName,
    },
    main: {
      align: "start" as "start",
      components: [
        {
          type: "Text",
          props: {
            text: "Waiting for the host to let you in...",
            align: "center",
            border: "none",
            color: "white",
            background: "transparent",
          },
        },
      ],
    },
  },
});

export const getManyForRoom = async (roomCode: string, userIds?: string[]) => {
  const operators = userIds
    ? {
        where: and(
          eq(members.roomCode, roomCode),
          inArray(members.userId, userIds)
        ),
      }
    : { where: eq(members.roomCode, roomCode) };

  return db.query.members.findMany(operators);
};

export const getOneForRoomAndUser = async ({
  userId,
  roomCode,
}: {
  userId: string;
  roomCode: string;
}) =>
  db.query.members.findFirst({
    where: and(eq(members.userId, userId), eq(members.roomCode, roomCode)),
  });

export const create = async ({
  userId,
  userName,
  roomCode,
  metadata,
}: NewMember): Promise<Member> => {
  await db
    .insert(members)
    .values({
      userId,
      userName: userName.toUpperCase(),
      roomCode,
      state: getDefaultState(userName),
      metadata,
    })
    .onConflictDoNothing();

  const member = (await getOneForRoomAndUser({
    userId,
    roomCode,
  })) as Member;

  return member;
};

export const updateStates = async (inputs: Member[]) => {
  if (!inputs.length) return;

  const sqlChunks: SQL[] = [];
  const ids: string[] = [];

  sqlChunks.push(sql`(CASE`);

  for (const input of inputs) {
    sqlChunks.push(
      sql`WHEN ${members.id} = ${input.id} THEN ${JSON.stringify(
        input.state
      )}::jsonb`
    );
    ids.push(input.id);
  }

  sqlChunks.push(sql`END)`);

  const finalSql: SQL = sql.join(sqlChunks, sql.raw(" "));

  await db
    .update(members)
    .set({ state: finalSql })
    .where(inArray(members.id, ids));
};
