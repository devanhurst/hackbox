import "dotenv/config";
import "./instrument";
import { createServer } from "node:http";
import * as Sentry from "@sentry/node";
import cors from "cors";
import express from "express";
import type { Socket } from "socket.io";
import { Server } from "socket.io";
import registerRoutes from "./api";
import { RoomService } from "./RoomService";

const port: number = parseInt(process.env.PORT as string, 10);

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

// Reject malformed percent-encoded URLs (e.g. "/rooms/abc%") with a 400 before
// they reach the router, since Express 5 throws a URIError while decoding such
// params. (Note: this is unrelated to the fatal Sentry crash — that originates
// in the SDK's stack-trace parser and is handled in instrument.ts.)
app.use((req, res, next) => {
  try {
    decodeURIComponent(req.path);
    next();
  } catch {
    res.status(400).json({ error: "Bad Request" });
  }
});

registerRoutes(app);

Sentry.setupExpressErrorHandler(app);

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

io.on("connection", async (socket: Socket) => RoomService.join(socket, io));

// Backstop: keep async faults from taking the whole server down. The original
// fatal (SERVER-3QX) arrived as an uncaughtException — Sentry's stack-trace
// parser threw a URIError while reporting another error — so we must handle that
// mechanism too, not just rejections.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
});

server.listen(port);
console.log(`📦 Hackbox listening on port ${port}...`);
