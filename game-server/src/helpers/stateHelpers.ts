import { MemberState } from "../../types";
import { randomUUID } from "crypto";
import { Member } from "../models";

export const getMemberState = (
  oldState: MemberState,
  newState: Partial<MemberState>
): MemberState => {
  const combinedState = oldState;
  if (newState.version) {
    combinedState.version = newState.version;
  }
  if (newState.theme) {
    if (newState.theme.header)
      combinedState.theme.header = {
        ...oldState.theme.header,
        ...newState.theme.header,
      };
    if (newState.theme.main)
      combinedState.theme.main = {
        ...oldState.theme.main,
        ...newState.theme.main,
      };
    if (newState.theme.fonts) {
      combinedState.theme.fonts = newState.theme.fonts;
    }
  }

  if (newState.presets) {
    const oldPresets = oldState.presets || {};
    combinedState.presets = { ...oldPresets, ...newState.presets };
  }

  if (newState.ui) {
    if (newState.ui.header)
      combinedState.ui.header = {
        ...oldState.ui.header,
        ...newState.ui.header,
      };
    if (newState.ui.main)
      combinedState.ui.main = { ...oldState.ui.main, ...newState.ui.main };
  }

  combinedState.ui.main.components = combinedState.ui.main.components.map(
    (component) => ({ key: randomUUID(), ...component })
  );

  return combinedState;
};

export const getHostState = async (roomCode: string) => {
  const members = await Member.getManyForRoom(roomCode);

  return {
    members: members.reduce((acc: { [memberId: string]: object }, member) => {
      const metadata = (member.metadata || {}) as any;

      acc[member.userId] = {
        id: member.userId,
        name: member.userName,
        metadata,
        twitchData: metadata.twitch,
      };

      return acc;
    }, {}),
  };
};
