import type { Express } from "express";
import { Member, Room } from "./models";

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
