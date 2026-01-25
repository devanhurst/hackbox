import "dotenv/config";
import "../instrument";
import { db, rooms } from "../db";
import { and, lt, eq } from "drizzle-orm";
import * as Sentry from "@sentry/node";

async function cleanupOldRooms() {
  try {
    console.log("Starting room cleanup...");

    // Calculate the timestamp for 24 hours ago
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Delete rooms (created over 24 hours ago and not persistent)
    // Members will be automatically deleted via CASCADE
    const deletedRooms = await db
      .delete(rooms)
      .where(and(lt(rooms.createdAt, twentyFourHoursAgo), eq(rooms.persistent, false)))
      .returning({ code: rooms.code });

    Sentry.metrics.count("rooms_deleted", deletedRooms.length);

    if (deletedRooms.length === 0) {
      console.log("No rooms to delete.");
      process.exit(0);
    }

    console.log(
      `Successfully deleted ${deletedRooms.length} rooms:`,
      deletedRooms.map((r) => r.code).join(", "),
    );
    process.exit(0);
  } catch (error) {
    console.error("Error during room cleanup:", error);
    process.exit(1);
  }
}

void cleanupOldRooms();
