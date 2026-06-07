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
// they reach the router. Express 5 throws a URIError while decoding such params,
// which would otherwise crash the process via Sentry's stack-trace parser.
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

// Backstop: never let an unhandled rejection take the whole server down.
// Sentry's stack-trace parser can throw URIError while reporting an error,
// which surfaces here as an unhandled rejection on Render.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});

server.listen(port);
console.log(`📦 Hackbox listening on port ${port}...`);
