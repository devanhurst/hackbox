import "dotenv/config";
import "./instrument.js";
import * as Sentry from "@sentry/node";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import { HostSocket, MemberSocket } from "./src/sockets";
import { Room } from "./src/models";

const port: number = parseInt(process.env.PORT, 10);

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

interface RoomCreationResponse {
  ok: boolean;
  error: string | undefined;
  roomCode: string | undefined;
}

app.get("/rooms/:roomCode", async (req, res) => {
  const roomCode = req.params.roomCode as string;
  const room = await Room.getOne(roomCode);

  const response = { exists: !!room, twitchRequired: false };
  if (room) response.twitchRequired = room.twitchRequired;

  res.json(response);
});

app.get("/rooms/:roomCode/auth-host/:userId", async (req, res) => {
  const { roomCode, userId } = req.params;
  const room = await Room.getOne(roomCode);
  const authed = userId === room?.hostId;
  res.json({ authed });
});

app.post("/rooms", async (req, res) => {
  const newRoom = await Room.create({
    hostId: req.body.hostId,
    twitchRequired: !!req.body.twitchRequired || false,
  });

  return res.json({ ok: true, roomCode: newRoom.code } as RoomCreationResponse);
});

app.get("/healthcheck", (_, res) => {
  res.json({ ok: true });
});

Sentry.setupExpressErrorHandler(app);

const server = createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

interface Handshake {
  userId: string;
  userName: string;
  roomCode: string;
  metadata: string;
}

interface HandshakeMetadata {
  twitchAccessToken?: string;
}

io.on("connection", async (socket: Socket) => {
  const handshake = socket.handshake.query as unknown as Handshake;
  const { userId, userName, roomCode } = handshake;

  let metadata: HandshakeMetadata = {};

  try {
    metadata = JSON.parse(handshake.metadata) as HandshakeMetadata;
  } catch (error) {
    console.error(
      "Handshake metadata was not a JSON string.",
      handshake.metadata
    );
  }

  const room = await Room.getOne(roomCode);

  if (!room) {
    socket.emit("error", { message: "This room does not exist." });
    socket.disconnect(true);
    return;
  }

  socket.data.userId = userId;
  socket.data.roomCode = roomCode;

  if (userId === room.hostId) {
    HostSocket.joinRoom(io, { socket });
  } else {
    MemberSocket.joinRoom(io, { socket, userName, metadata });
  }
});

server.listen(port);

console.log(`✨ Backend listening on ${port}!`);
