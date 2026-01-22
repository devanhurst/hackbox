import { v4 as uuid } from "uuid";

const USERID_KEY = "hackbox-player-userid";
const USERNAME_KEY = "hackbox-player-username";
const ROOMCODE_KEY = "hackbox-player-roomcode";
const TWITCH_ACCESS_TOKEN = "hackbox-player-twitch-access-token";

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
  getTwitchAccessToken,
  setTwitchAccessToken,
  deleteTwitchAccessToken,
};
