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

// Find a room across both backends: the new Cloudflare relay first, then the
// legacy socket.io server (for rooms hosted by not-yet-updated Unity games).
// `legacy` tells the player view which transport to connect with.
export const getRoom = async ({
  roomCode,
  userId,
}: {
  roomCode: string;
  userId: string;
}): Promise<FindRoomResponse> => {
  if (roomCode.length !== 4) return { exists: false };

  const fromNew = await probe(`${config.apiUrl}/rooms/${roomCode}?userId=${userId}`);
  if (fromNew?.exists) return { ...fromNew, legacy: false };

  const fromLegacy = await probe(`${config.legacyServerUrl}/rooms/${roomCode}?userId=${userId}`);
  if (fromLegacy?.exists) return { ...fromLegacy, legacy: true };

  return { exists: false };
};
