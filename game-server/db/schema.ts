import { defineRelations } from "drizzle-orm";
import { boolean, json, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
  online: boolean("online").default(false).notNull(),
  metadata: json("metadata"),
});

export const relations = defineRelations({ rooms, members }, (r) => ({
  rooms: {
    host: r.one.members({
      from: r.rooms.hostId,
      to: r.members.userId,
    }),
  },
  members: {},
}));
