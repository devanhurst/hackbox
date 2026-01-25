declare global {
  namespace NodeJS {
    interface ProcessEnv {
      PORT: string;
      PLAYER_ORIGIN: string;
    }
  }
}

export {};
