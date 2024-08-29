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

export type Room = typeof rooms.$inferSelect;
export type NewRoom = typeof rooms.$inferInsert;
export type Member = typeof members.$inferSelect;
export type NewMember = typeof members.$inferInsert;

export default drizzle(postgres(process.env.DATABASE_URL as string), {
  schema: { rooms, members },
});
