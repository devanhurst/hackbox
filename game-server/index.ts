import "dotenv/config";
import "./instrument";
import * as Sentry from "@sentry/node";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import { Room, Member } from "./models";
import { joinRoom } from "./RoomService";

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
  const userId = req.query.userId as string;

  const room = await Room.find(roomCode);

  if (!room) return { exists: false };
  if (room.closed) {
    const existingMember = await Member.find({ roomCode, userId });
    if (!existingMember) return { exists: false };
  }

  res.json({ exists: true, twitchRequired: room.twitchRequired });
});

app.get("/rooms/:roomCode/auth-host/:userId", async (req, res) => {
  const { roomCode, userId } = req.params;
  const room = await Room.find(roomCode);
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

io.on("connection", async (socket: Socket) => {
  try {
    await joinRoom({ socket, server: io });
  } catch (e) {
    console.error("Failed to join room.", e);
  }
});

server.listen(port);

console.log(`✨ Backend listening on ${port}!`);
