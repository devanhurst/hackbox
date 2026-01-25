import { eq, inArray } from "drizzle-orm";
import { db, members } from "../db";
import type { TwitchMetadata } from "../lib/twitch";

interface Component {
  type: string;
  props: { [key: string]: unknown };
}

export interface MemberState {
  theme: {
    header: {
      color?: string;
      background?: string;
      fontFamily?: string;
    };
    main: {
      background?: string;
    };
  };
  ui: {
    header: {
      text?: string;
    };
    main: {
      align?: "start" | "center" | "end";
      components: Component[];
    };
  };
  presets?: { [key: string]: Component };
}

interface MemberMetadata {
  twitch?: TwitchMetadata;
}

export class Member {
  id: string;
  userId: string;
  userName: string;
  online: boolean;
  metadata: MemberMetadata;
  state: MemberState;

  static async find({
    userId,
    roomCode,
  }: {
    userId: string;
    roomCode: string;
  }): Promise<Member | null> {
    const member = await db.query.members.findFirst({
      where: {
        userId,
        roomCode,
      },
    });

    if (!member) return null;
    return new Member(member);
  }

  static async findMany(ids: string[]): Promise<Member[]> {
    const result = await db.select().from(members).where(inArray(members.id, ids));

    return result.map((m) => new Member(m));
  }

  static async create(props: {
    roomCode: string;
    userId: string;
    userName: string;
    metadata: MemberMetadata;
    online: boolean;
    state: Partial<MemberState>;
  }): Promise<Member> {
    const member = (
      await db
        .insert(members)
        .values({
          ...props,
          userName: props.userName.toUpperCase(),
        })
        .returning()
    )[0];

    return new Member(member);
  }

  constructor(props: {
    id: string;
    userId: string;
    userName: string;
    online: boolean;
    metadata: unknown;
    state?: unknown;
  }) {
    this.id = props.id;
    this.userId = props.userId;
    this.userName = props.userName;
    this.online = props.online;
    this.metadata = props.metadata as MemberMetadata;
    this.state = props.state as MemberState;
  }

  async save(props: {
    online?: boolean;
    metadata?: MemberMetadata;
    state?: MemberState;
  }): Promise<void> {
    await db.update(members).set(props).where(eq(members.id, this.id));
  }
}
