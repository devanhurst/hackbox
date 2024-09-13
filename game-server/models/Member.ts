import MemberRepository, {
  SavedMember,
  SavedMemberInput,
} from "../db/MemberRepository";
import { TwitchMetadata } from "../lib/twitch";

interface Component {
  type: string;
  props: { [key: string]: unknown };
}

interface CustomFont {
  family: string;
}

interface MemberState {
  id: string;
  version: number;
  theme: {
    header: {
      color: string;
      background: string;
    };
    main: {
      background: string;
    };
    fonts?: CustomFont[];
  };
  ui: {
    header: {
      text: string;
    };
    main: {
      align: "start" | "center" | "end";
      components: Component[];
    };
  };
  presets?: { [key: string]: Component };
}

interface MemberMetadata {
  twitch?: TwitchMetadata;
}

interface CreateProps {
  roomCode: string;
  userId: string;
  userName: string;
  metadata: MemberMetadata;
  online: boolean;
  state: MemberState;
}

interface ConstructorProps extends CreateProps {
  id: string;
}

export class Member {
  id: string;
  userId: string;
  userName: string;
  roomCode: string;
  online: boolean;
  metadata: MemberMetadata;
  state: MemberState;

  static fromDatabaseResult(result: SavedMember) {
    return new Member({
      id: result.id,
      userId: result.userId,
      roomCode: result.roomCode,
      userName: result.userName,
      online: result.online,
      metadata: result.metadata as MemberMetadata,
      state: result.state as MemberState,
    });
  }

  static async find({
    userId,
    roomCode,
  }: {
    userId: string;
    roomCode: string;
  }): Promise<Member | null> {
    const member = await MemberRepository.findForUserAndRoom({
      userId,
      roomCode,
    });

    return member ? Member.fromDatabaseResult(member) : null;
  }

  static async create(props: CreateProps): Promise<Member> {
    const member = await MemberRepository.create(props);
    return Member.fromDatabaseResult(member);
  }

  constructor(props: ConstructorProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.roomCode = props.roomCode;
    this.userName = props.userName;
    this.online = props.online;
    this.metadata = props.metadata;
    this.state = props.state;
  }

  async save(props: Partial<SavedMemberInput>): Promise<void> {
    await MemberRepository.update(this.id, props);
  }
}
