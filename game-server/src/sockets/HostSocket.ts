import { MemberState } from "../../types";
import { getMemberState, getHostState } from "../helpers/stateHelpers";
import { Member } from "../models";

interface JoinRoomInput {
  socket: any;
}

const getRecipients = async (io: any, roomCode: string, userIds: string[]) => {
  const members = await Member.getManyForRoom(roomCode, [userIds].flat());
  const sockets = (await io.fetchSockets()).filter(
    (s: any) => s.data.roomCode === roomCode
  );

  return members.map((member) => ({
    member,
    socket: sockets.find((s: any) => s.data.userId === member.userId),
  }));
};

export const joinRoom = async (io: any, options: JoinRoomInput) => {
  const { socket } = options;
  const { roomCode } = socket.data;

  socket.join(roomCode);
  socket.emit("state.host", await getHostState(roomCode));

  // member.update
  // Host sends this event to update the state for one or many players.
  socket.on("member.update", async (payload: any) => {
    let recipients = await getRecipients(io, roomCode, payload.to);

    recipients = recipients.map((recipient) => ({
      ...recipient,
      member: {
        ...recipient.member,
        state: getMemberState(
          recipient.member.state as MemberState,
          payload.data
        ),
      },
    }));

    recipients.forEach((recipient: any) => {
      recipient.socket.emit("state.member", recipient.member.state);
    });

    Member.updateStates(recipients.map((r) => r.member));
  });

  // event
  // Host sends this arbitrary event to all players.
  socket.on("event", async (payload: any) => {
    io.to(roomCode).emit("event", payload);
  });
};
