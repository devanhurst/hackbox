import config from "@/config";
import type { FindRoomResponse } from "@/types";

export const getRoom = async ({
  roomCode,
  userId,
}: {
  roomCode: string;
  userId: string;
}): Promise<FindRoomResponse> => {
  if (roomCode.length !== 4) return { exists: false };

  const response = await fetch(`${config.apiUrl}/rooms/${roomCode}?userId=${userId}`);

  return response.json();
};
