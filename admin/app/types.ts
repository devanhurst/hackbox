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
