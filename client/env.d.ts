/// <reference types="vite/client" />

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      PORT: string;
      BACKEND_URI: string;
    }
  }
}

export {};
