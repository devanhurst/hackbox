import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { relations } from "./schema";

export const db = drizzle(process.env.DATABASE_URL! as string, { relations });

export * from "./schema";
