import db, { messages, Message, NewMessage } from "../db";

export type MessageType = Message;
export type MessageInput = NewMessage;

export const create = async ({ memberId, payload, receivedAt }: NewMessage) =>
  db.insert(messages).values({
    memberId,
    payload,
    receivedAt,
  });
