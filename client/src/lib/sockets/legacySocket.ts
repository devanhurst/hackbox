import { io, type Socket } from "socket.io-client";
import config from "@/config";
import type { HackboxSocket } from "./hackboxSocket";

// Backward-compatibility connector for rooms still hosted on the legacy
// socket.io server (app.hackbox.ca — the old Render deployment). It wraps a
// socket.io connection in the same HackboxSocket interface the new relay SDK
// exposes, so the rest of the player client is transport-agnostic.
//
// The application protocol is identical on both transports (state.member,
// reload, error, msg, change), and socket.io's disconnect reasons match the set
// playerSocket already treats as transient — so the player UI code is unchanged.

interface LegacySocketOptions {
  roomCode: string;
  userId: string;
  userName?: string;
  metadata?: Record<string, unknown>;
}

export function createLegacySocket(options: LegacySocketOptions): HackboxSocket {
  const socket: Socket = io(config.legacyServerUrl, {
    query: {
      userId: options.userId,
      userName: options.userName ?? "",
      roomCode: options.roomCode,
      metadata: JSON.stringify(options.metadata ?? {}),
    },
  });

  return {
    on(event, cb) {
      socket.on(event, cb as (...args: unknown[]) => void);
      return () => socket.off(event, cb as (...args: unknown[]) => void);
    },
    off(event, cb) {
      socket.off(event, cb as (...args: unknown[]) => void);
    },
    emit(event, payload) {
      socket.emit(event, payload);
    },
    close() {
      socket.disconnect();
    },
    disconnect() {
      socket.disconnect();
    },
    get connected() {
      return socket.connected;
    },
    raw: socket,
  };
}
