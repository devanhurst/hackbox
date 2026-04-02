import { Server, routePartykitRequest, type Connection, type ConnectionContext } from "partyserver";
import { RoomStorage, type RoomData, type MemberData } from "./storage";
import { defaultMemberState, sanitizeState } from "./helpers";
import { authenticateWithTwitch } from "./lib/twitch";
import type {
  InboundMessage,
  HostMemberUpdateMessage,
  MemberMsgMessage,
  MemberChangeMessage,
  ServerToHostMessage,
  ServerToMemberMessage,
  MemberInfo,
} from "./messages";

interface Env {
  TWITCH_CLIENT_ID?: string;
  SENTRY_DSN?: string;
  HackboxParty: DurableObjectNamespace;
}

// Worker entry point - routes requests to the correct Durable Object
export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    const corsHeaders = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // POST /rooms - Generate a room code and initialize the DO
    if (url.pathname === "/rooms" && request.method === "POST") {
      const body = (await request.json()) as {
        hostId: string;
        twitchRequired?: boolean;
      };

      // Generate a unique room code by checking if the DO already has data
      let roomCode: string;
      let attempts = 0;
      do {
        roomCode = generateRoomCode();
        // Check if room already exists by GETting the party
        const checkUrl = new URL(
          `/parties/hackboxparty/${roomCode}`,
          url.origin,
        );
        const checkResponse = await routePartykitRequest(
          new Request(checkUrl.toString()),
          env,
        );
        if (checkResponse) {
          const data = (await checkResponse.json()) as { exists: boolean };
          if (!data.exists) break;
        } else {
          break;
        }
        attempts++;
      } while (attempts < 10);

      // POST to the party to initialize the room
      const partyUrl = new URL(
        `/parties/hackboxparty/${roomCode}`,
        url.origin,
      );
      const initResponse = await routePartykitRequest(
        new Request(partyUrl.toString(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
        env,
      );

      if (initResponse) {
        return new Response(initResponse.body, {
          status: initResponse.status,
          headers: corsHeaders,
        });
      }

      return new Response(
        JSON.stringify({ ok: false, error: "Failed to create room" }),
        { status: 500, headers: corsHeaders },
      );
    }

    // Route PartyKit requests (WebSocket upgrades and HTTP) to the HackboxParty DO
    const response = await routePartykitRequest(request, env);
    if (response) return response;

    // Fallback: healthcheck at root
    if (url.pathname === "/healthcheck") {
      return new Response(JSON.stringify({ ok: true }), {
        headers: corsHeaders,
      });
    }

    return new Response("Not Found", { status: 404 });
  },
};

const CONSONANTS = [
  "B", "C", "D", "F", "G", "H", "J", "K", "L", "M",
  "N", "P", "Q", "R", "S", "T", "V", "W", "X", "Z",
];

function generateRoomCode(): string {
  return [1, 2, 3, 4]
    .map(() => CONSONANTS[Math.floor(Math.random() * CONSONANTS.length)])
    .join("");
}

function send(connection: Connection, message: ServerToMemberMessage | ServerToHostMessage) {
  connection.send(JSON.stringify(message));
}

function closeWithError(connection: Connection, message: string) {
  send(connection, { type: "error", payload: { message } });
  connection.close(4000, message);
}

function getQueryParam(request: Request, key: string): string {
  return new URL(request.url).searchParams.get(key) ?? "";
}

export class HackboxParty extends Server<Env> {
  static options = { hibernate: true };

  private storage!: RoomStorage;
  private room: RoomData | null = null;
  private newestHostConnectionId: string | null = null;

  async onStart() {
    this.storage = new RoomStorage(this.ctx.storage);
    this.room = (await this.storage.getRoom()) ?? null;
  }

  // -- HTTP handling (replaces api.ts) --

  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const headers = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    // POST: Create/initialize room
    if (request.method === "POST") {
      if (this.room) {
        return new Response(
          JSON.stringify({ ok: false, error: "Room already exists" }),
          { status: 409, headers },
        );
      }

      const body = (await request.json()) as {
        hostId: string;
        twitchRequired?: boolean;
      };

      this.room = {
        code: this.name,
        hostId: body.hostId,
        closed: false,
        persistent: false,
        twitchRequired: !!body.twitchRequired,
        createdAt: new Date().toISOString(),
      };

      await this.storage.setRoom(this.room);

      // Set cleanup alarm for 24 hours
      await this.ctx.storage.setAlarm(Date.now() + 24 * 60 * 60 * 1000);

      return new Response(
        JSON.stringify({ ok: true, roomCode: this.name }),
        { status: 200, headers },
      );
    }

    // GET: Check room existence
    if (request.method === "GET") {
      if (!this.room) {
        return new Response(
          JSON.stringify({ exists: false }),
          { status: 200, headers },
        );
      }

      if (this.room.closed) {
        const userId = url.searchParams.get("userId") ?? "";
        const member = await this.storage.getMember(userId);
        if (!member) {
          return new Response(
            JSON.stringify({ exists: false }),
            { status: 200, headers },
          );
        }
      }

      return new Response(
        JSON.stringify({
          exists: true,
          twitchRequired: this.room.twitchRequired,
        }),
        { status: 200, headers },
      );
    }

    return new Response("Not Found", { status: 404, headers });
  }

  // -- WebSocket lifecycle --

  getConnectionTags(
    connection: Connection,
    ctx: ConnectionContext,
  ): string[] | Promise<string[]> {
    const userId = getQueryParam(ctx.request, "userId");

    if (this.room && userId === this.room.hostId) {
      return ["host", `user:${userId}`];
    }
    return ["member", `user:${userId}`];
  }

  async onConnect(connection: Connection, ctx: ConnectionContext) {
    if (!this.room) {
      closeWithError(connection, "This room does not exist.");
      return;
    }

    const userId = getQueryParam(ctx.request, "userId");
    const userName = getQueryParam(ctx.request, "userName");
    const metadataStr = getQueryParam(ctx.request, "metadata");

    const isHost = userId === this.room.hostId;

    if (isHost) {
      this.newestHostConnectionId = connection.id;
      this.broadcastHostState();
      return;
    }

    // Member connection
    const handshakeMetadata = metadataStr ? JSON.parse(metadataStr) : {};
    const twitch = await authenticateWithTwitch(
      handshakeMetadata.twitchAccessToken,
      this.env.TWITCH_CLIENT_ID,
    );
    const metadata = { twitch };

    const existingMember = await this.storage.getMember(userId);

    if (existingMember) {
      await this.storage.updateMember(userId, {
        online: true,
        metadata,
      });
    }

    if (this.room.closed && !existingMember) {
      closeWithError(connection, "This room is closed.");
      return;
    }

    if (this.room.twitchRequired && !metadata.twitch) {
      closeWithError(
        connection,
        "Please log in with Twitch before joining this room.",
      );
      return;
    }

    const member: MemberData = existingMember
      ? { ...existingMember, online: true, metadata }
      : {
          userId,
          userName: userName.toUpperCase(),
          state: sanitizeState(defaultMemberState(userName.toUpperCase())),
          online: true,
          metadata,
          createdAt: new Date().toISOString(),
        };

    if (!existingMember) {
      await this.storage.saveMember(member);
    }

    // Disconnect older connections from same user
    for (const conn of this.getConnections("member")) {
      if (conn.id === connection.id) continue;

      const connUserId = conn.tags?.find((t) => t.startsWith("user:"))?.slice(5);
      if (connUserId === userId) {
        closeWithError(conn, "You have connected from another device.");
      }
    }

    // Send current state to the new member
    send(connection, {
      type: "state.member",
      payload: member.state,
    });

    this.broadcastHostState();
  }

  async onMessage(connection: Connection, message: string | ArrayBuffer) {
    if (!this.room) return;

    const data = JSON.parse(
      typeof message === "string" ? message : new TextDecoder().decode(message),
    ) as InboundMessage;

    const isHost = connection.tags?.includes("host") ?? false;

    if (isHost) {
      await this.handleHostMessage(data);
    } else {
      const userId =
        connection.tags?.find((t) => t.startsWith("user:"))?.slice(5) ?? "";
      await this.handleMemberMessage(data, userId);
    }
  }

  async onClose(connection: Connection) {
    if (!this.room) return;

    const isHost = connection.tags?.includes("host") ?? false;
    if (isHost) {
      if (this.newestHostConnectionId === connection.id) {
        this.newestHostConnectionId = null;
      }
      return;
    }

    const userId =
      connection.tags?.find((t) => t.startsWith("user:"))?.slice(5) ?? "";
    if (userId) {
      // Check if user has any other active connections
      let hasOtherConnection = false;
      for (const conn of this.getConnections("member")) {
        const connUserId = conn.tags?.find((t) => t.startsWith("user:"))?.slice(5);
        if (connUserId === userId && conn.id !== connection.id) {
          hasOtherConnection = true;
          break;
        }
      }

      if (!hasOtherConnection) {
        await this.storage.updateMember(userId, { online: false });
      }
    }

    this.broadcastHostState();
  }

  async onAlarm() {
    const room = await this.storage.getRoom();
    if (room && !room.persistent) {
      await this.storage.deleteAll();
      this.room = null;
    }
  }

  // -- Host message handlers --

  private async handleHostMessage(data: InboundMessage) {
    if (data.type === "member.update") {
      const payload = (data as HostMemberUpdateMessage).payload;
      const recipients = [payload.to].flat();
      await this.updateMemberStates(recipients, payload.data);
    } else if (data.type === "reload") {
      for (const conn of this.getConnections("member")) {
        send(conn, { type: "reload" });
      }
    }
  }

  // -- Member message handlers --

  private async handleMemberMessage(data: InboundMessage, userId: string) {
    if (data.type === "msg") {
      const payload = (data as MemberMsgMessage).payload;
      this.sendToHost({
        type: "msg",
        payload: {
          from: userId,
          event: payload.event,
          message: payload,
          timestamp: Date.now(),
        },
      });
    } else if (data.type === "change") {
      const payload = (data as MemberChangeMessage).payload;
      this.sendToHost({
        type: "change",
        payload: {
          from: userId,
          event: payload.event,
          message: payload,
          timestamp: Date.now(),
        },
      });
    }
  }

  // -- Broadcasting helpers --

  private sendToHost(message: ServerToHostMessage) {
    if (!this.newestHostConnectionId) return;

    const host = this.getConnection(this.newestHostConnectionId);
    if (host) {
      send(host, message);
    }
  }

  private async broadcastHostState() {
    const members = await this.storage.getAllMembers();
    const memberSockets = Array.from(this.getConnections("member"));

    const membersState: Record<string, MemberInfo> = {};

    for (const member of members) {
      const isOnline = memberSockets.some((s) => {
        const connUserId = s.tags?.find((t) => t.startsWith("user:"))?.slice(5);
        return connUserId === member.userId;
      });

      membersState[member.userId] = {
        id: member.userId,
        name: member.userName,
        online: isOnline,
        metadata: (member.metadata ?? {}) as Record<string, unknown>,
        twitchData: member.metadata?.twitch,
      };
    }

    const message: ServerToHostMessage = {
      type: "state.host",
      payload: { members: membersState },
    };

    for (const conn of this.getConnections("host")) {
      send(conn, message);
    }
  }

  private async updateMemberStates(
    recipients: string[],
    newState: import("./types").MemberState,
  ) {
    const allMembers = await this.storage.getAllMembers();
    const targetMembers = allMembers.filter((m) =>
      recipients.includes(m.userId),
    );

    for (const member of targetMembers) {
      const state = sanitizeState(newState);
      await this.storage.updateMember(member.userId, { state });

      // Send to connected member sockets
      for (const conn of this.getConnections("member")) {
        const connUserId = conn.tags?.find((t) => t.startsWith("user:"))?.slice(5);
        if (connUserId === member.userId) {
          send(conn, { type: "state.member", payload: state });
        }
      }
    }
  }
}
