import type { MemberState, MemberMetadata } from "./types";

export interface RoomData {
  code: string;
  hostId: string;
  closed: boolean;
  persistent: boolean;
  twitchRequired: boolean;
  createdAt: string;
}

export interface MemberData {
  userId: string;
  userName: string;
  state: MemberState;
  online: boolean;
  metadata: MemberMetadata;
  createdAt: string;
}

export class RoomStorage {
  constructor(private storage: DurableObjectState["storage"]) {}

  async getRoom(): Promise<RoomData | undefined> {
    return this.storage.get<RoomData>("room");
  }

  async setRoom(room: RoomData): Promise<void> {
    await this.storage.put("room", room);
  }

  async getMember(userId: string): Promise<MemberData | undefined> {
    return this.storage.get<MemberData>(`member:${userId}`);
  }

  async getAllMembers(): Promise<MemberData[]> {
    const memberIds = (await this.storage.get<string[]>("members")) ?? [];
    if (memberIds.length === 0) return [];

    const entries = await this.storage.get<MemberData>(
      memberIds.map((id) => `member:${id}`),
    );

    return Array.from(entries.values()).filter(
      (m): m is MemberData => m !== undefined,
    );
  }

  async saveMember(member: MemberData): Promise<void> {
    await this.storage.put(`member:${member.userId}`, member);

    const memberIds = (await this.storage.get<string[]>("members")) ?? [];
    if (!memberIds.includes(member.userId)) {
      memberIds.push(member.userId);
      await this.storage.put("members", memberIds);
    }
  }

  async updateMember(
    userId: string,
    updates: Partial<MemberData>,
  ): Promise<MemberData | undefined> {
    const member = await this.getMember(userId);
    if (!member) return undefined;

    const updated = { ...member, ...updates };
    await this.storage.put(`member:${userId}`, updated);
    return updated;
  }

  async deleteAll(): Promise<void> {
    await this.storage.deleteAll();
  }
}
