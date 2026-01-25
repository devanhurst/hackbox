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

registerRoutes(app);

Sentry.setupExpressErrorHandler(app);

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

io.on("connection", async (socket: Socket) => RoomService.join(socket, io));

server.listen(port);
console.log(`📦 Hackbox listening on port ${port}...`);
