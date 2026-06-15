import { MAX_CODE_ATTEMPTS, type RoomSettings, generateRoomCode, initRoom } from "../utils/rooms";

// Create a room with all settings (random code). hostId generated if absent.
export default defineEventHandler(async (event) => {
  const env = getEnv(event);
  const body = await readBody<Record<string, unknown>>(event).catch(
    () => ({}) as Record<string, unknown>,
  );

  const hostId = (typeof body.hostId === "string" && body.hostId.trim()) || crypto.randomUUID();
  const settings: RoomSettings = {
    hostId,
    twitchRequired: Boolean(body.twitchRequired),
    persistent: Boolean(body.persistent),
    closed: Boolean(body.closed),
  };

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const code = generateRoomCode();
    const res = await initRoom(env.RELAY, code, settings);
    if (res.status === 409) continue;
    if (res.ok) return { ok: true, roomCode: code, hostId };
    setResponseStatus(event, 502);
    return { ok: false, error: `relay init failed: ${res.status}` };
  }

  setResponseStatus(event, 503);
  return { ok: false, error: "could not allocate a room code" };
});
