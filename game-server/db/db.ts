import "dotenv/config";

import {
  pgTable,
  uuid,
  boolean,
  timestamp,
  json,
  text,
} from "drizzle-orm/pg-core";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

export const rooms = pgTable("rooms", {
  code: text("code").primaryKey(),
  hostId: uuid("host_id").notNull(),
  persistent: boolean("persistent").default(false),
  closed: boolean("closed").default(false).notNull(),
  twitchRequired: boolean("twitch_required").default(false).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const members = pgTable("members", {
  id: uuid("id").primaryKey().defaultRandom(),
  roomCode: text("room_code").notNull(),
  userId: uuid("user_id").notNull(),
  userName: text("user_name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  state: json("state"),
  metadata: json("metadata"),
});

export type SavedRoom = typeof rooms.$inferSelect;
export type InsertRoomInput = typeof rooms.$inferInsert;
export type SavedMember = typeof members.$inferSelect;
export type InsertMemberInput = typeof members.$inferInsert;

export default drizzle(postgres(process.env.DATABASE_URL as string), {
  schema: { rooms, members },
});
