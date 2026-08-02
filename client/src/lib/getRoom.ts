import config from "@/config";
import type { FindRoomResponse } from "@/types";

const probe = async (url: string): Promise<FindRoomResponse | null> => {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as FindRoomResponse;
  } catch {
    return null;
  }
};

export const getRoom = async ({
  roomCode,
  userId,
}: {
  roomCode: string;
  userId: string;
}): Promise<FindRoomResponse> => {
  if (roomCode.length !== 4) return { exists: false };

  const room = await probe(`${config.apiUrl}/rooms/${roomCode}?userId=${userId}`);
  if (room?.exists) return room;

  return { exists: false };
};
