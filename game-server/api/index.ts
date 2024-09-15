import { Express } from "express";
import { Room, Member } from "../models";

interface RoomCreationResponse {
  ok: boolean;
  error: string | undefined;
  roomCode: string | undefined;
}

export default (app: Express) => {
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

    return res.json({
      ok: true,
      roomCode: newRoom.code,
    } as RoomCreationResponse);
  });

  app.get("/healthcheck", (_, res) => {
    res.json({ ok: true });
  });
};
