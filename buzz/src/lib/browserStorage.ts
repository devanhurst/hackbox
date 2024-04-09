import { v4 as uuid } from "uuid";

const APP_PREFIX = "hackbox-buzz";
const USERID_KEY = `${APP_PREFIX}-userId`;
const VOLUME_KEY = `${APP_PREFIX}-volume`;

const getUserId = () => {
  const key = `${APP_PREFIX}-${USERID_KEY}`;
  let userId = window.localStorage.getItem(key);
  if (!userId) {
    userId = uuid();
    window.localStorage.setItem(key, userId);
  }
  return userId;
};

const getVolume = () => {
  let volume = window.localStorage.getItem(VOLUME_KEY);
  if (!volume) {
    volume = "quiet";
    window.localStorage.setItem(VOLUME_KEY, volume);
  }

  return volume;
};

const setVolume = (volume: string) => {
  window.localStorage.setItem(VOLUME_KEY, volume);
};

export { getUserId, getVolume, setVolume };
