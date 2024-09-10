import { SavedMember } from "../db/db";
import * as MemberRepository from "../db/Member";
import { MemberState, MemberMetadata } from "../types";

interface ConstructorProps {
  id: string;
  userId: string;
  userName: string;
  roomCode: string;
  metadata: MemberMetadata;
  state: MemberState;
}

interface CreateProps {
  roomCode: string;
  userId: string;
  userName: string;
}

interface UpdateProps {
  userName?: string;
  metadata?: MemberMetadata;
  state?: MemberState;
}

export class Member {
  id: string;
  userId: string;
  userName: string;
  roomCode: string;
  metadata: MemberMetadata;
  state: MemberState;

  static fromDatabaseResult(result: SavedMember) {
    return new Member({
      id: result.id,
      userId: result.userId,
      roomCode: result.roomCode,
      userName: result.userName,
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
    this.metadata = props.metadata;
    this.state = props.state;
  }

  async save(props: UpdateProps): Promise<void> {
    await MemberRepository.update(this.id, props);
  }
}
