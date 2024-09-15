import "dotenv/config";
import "./instrument";
import * as Sentry from "@sentry/node";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Socket, Server } from "socket.io";
import registerRoutes from "./api";
import { RoomService } from "./RoomService";

const port: number = parseInt(process.env.PORT, 10);

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
console.log(`✨ Backend listening on ${port}!`);
