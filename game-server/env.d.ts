declare global {
  namespace NodeJS {
    interface ProcessEnv {
      PORT: string;
      PLAYER_ORIGIN: string;
      ROOM_DELETION_TIME_HOURS: number;
    }
  }
}

export {};
