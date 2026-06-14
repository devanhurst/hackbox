import { v4 as uuid } from "uuid";

const USERID_KEY = "userid";
const USERNAME_KEY = "username";
const ROOMCODE_KEY = "roomcode";
const ROOM_LEGACY_KEY = "room-legacy";
const TWITCH_ACCESS_TOKEN = "twitch-access-token";

const getUserId = () => {
  let userId = window.localStorage.getItem(USERID_KEY);
  if (!userId) {
    userId = uuid();
    window.localStorage.setItem(USERID_KEY, userId);
  }
  return userId;
};

const getUserName = () => window.localStorage.getItem(USERNAME_KEY) || "";
const setUserName = (name: string) => {
  window.localStorage.setItem(USERNAME_KEY, name.slice(0, 12).toUpperCase());
};

const getRoomCode = () => window.localStorage.getItem(ROOMCODE_KEY) || "";
const setRoomCode = (code: string) => {
  window.localStorage.setItem(ROOMCODE_KEY, code.slice(0, 4).toUpperCase());
};

// Whether the joined room lives on the legacy socket.io server (vs the new
// relay) — set at join time, read by the player socket to pick its transport.
const getRoomLegacy = () => window.localStorage.getItem(ROOM_LEGACY_KEY) === "1";
const setRoomLegacy = (legacy: boolean) => {
  window.localStorage.setItem(ROOM_LEGACY_KEY, legacy ? "1" : "");
};

const getTwitchAccessToken = () => window.localStorage.getItem(TWITCH_ACCESS_TOKEN) || "";
const setTwitchAccessToken = (token: string) => {
  window.localStorage.setItem(TWITCH_ACCESS_TOKEN, token);
};
const deleteTwitchAccessToken = () => window.localStorage.removeItem(TWITCH_ACCESS_TOKEN);

export {
  getUserId,
  getUserName,
  setUserName,
  getRoomCode,
  setRoomCode,
  getRoomLegacy,
  setRoomLegacy,
  getTwitchAccessToken,
  setTwitchAccessToken,
  deleteTwitchAccessToken,
};
