// Shapes returned by the admin server routes (server/api/*).

export interface AdminMember {
  userId: string;
  userName: string;
  twitch: string | null;
  online: boolean;
}

export interface AdminRoom {
  id: string;
  code: string;
  hostId: string;
  twitchRequired: boolean;
  persistent: boolean;
  closed: boolean;
  createdAt: number;
  endedAt: number | null;
  endReason: string | null;
  live: boolean;
  hasHost: boolean;
  expiresAt: number | null;
  memberCount: number;
  onlineCount: number;
  members?: AdminMember[];
}

export interface RoomsResponse {
  rooms: AdminRoom[];
  error?: string;
}

export interface RoomResponse {
  room?: AdminRoom;
  error?: string;
}

// A relayed frame in the admin monitor feed (relay/src/messageLog.ts). Oversized
// payloads arrive as a `{ truncated, bytes, preview }` marker instead of the raw
// value.
export interface AdminMessage {
  seq: number;
  direction: "member_to_host" | "host_to_member";
  type: "msg" | "change" | "state.member";
  from: string | null;
  to: string | null;
  event: string | null;
  payload: unknown;
  timestamp: number;
}

export interface MessagesResponse {
  messages: AdminMessage[];
  nextSeq?: number;
  oldestSeq?: number | null;
  source: "live" | "history";
  hasMore?: boolean;
  error?: string;
}
