import type { MemberState } from "./types";

// -- Client -> Server (from member) --

export interface MemberMsgMessage {
  type: "msg";
  payload: {
    event: string;
    value: unknown;
    ms?: number;
  };
}

export interface MemberChangeMessage {
  type: "change";
  payload: {
    event: string;
    value: unknown;
  };
}

export type MemberToServerMessage = MemberMsgMessage | MemberChangeMessage;

// -- Client -> Server (from host) --

export interface HostMemberUpdateMessage {
  type: "member.update";
  payload: {
    to: string | string[];
    data: MemberState;
  };
}

export interface HostReloadMessage {
  type: "reload";
}

export type HostToServerMessage = HostMemberUpdateMessage | HostReloadMessage;

// -- Server -> Client (to member) --

export interface StateMemberMessage {
  type: "state.member";
  payload: MemberState;
}

export interface ErrorMessage {
  type: "error";
  payload: { message: string };
}

export interface ReloadMessage {
  type: "reload";
}

export type ServerToMemberMessage = StateMemberMessage | ErrorMessage | ReloadMessage;

// -- Server -> Client (to host) --

export interface MemberInfo {
  id: string;
  name: string;
  online: boolean;
  metadata: Record<string, unknown>;
  twitchData?: unknown;
}

export interface StateHostMessage {
  type: "state.host";
  payload: {
    members: Record<string, MemberInfo>;
  };
}

export interface HostMsgEvent {
  type: "msg";
  payload: {
    from: string;
    event: string;
    message: unknown;
    timestamp: number;
  };
}

export interface HostChangeEvent {
  type: "change";
  payload: {
    from: string;
    event: string;
    message: unknown;
    timestamp: number;
  };
}

export type ServerToHostMessage = StateHostMessage | HostMsgEvent | HostChangeEvent;

// -- All inbound messages --

export type InboundMessage = MemberToServerMessage | HostToServerMessage;
