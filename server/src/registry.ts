import type { RoomCreatePayload, roomParticipant } from "@ciderjams/proto";

import { randomBytes } from "node:crypto";

import { Room } from "./room";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newRoomId(): string {
  return randomBytes(16).toString("hex");
}

function randomRoomCode(length = 6): string {
  const bytes = randomBytes(length);
  let code = "";

  for (let i = 0; i < length; i++) {
    const byte = bytes[i] ?? 0;
    code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  }

  return code;
}

export class RoomRegistry {
  readonly byId = new Map<string, Room>();
  readonly codeToId = new Map<string, string>();

  createRoom(host: roomParticipant, playbackState: RoomCreatePayload["playbackState"]): Room {
    const roomId = newRoomId();
    let code = randomRoomCode();
    while (this.codeToId.has(code)) code = randomRoomCode();

    const room = Room.create(host, roomId, code, playbackState);
    this.byId.set(roomId, room);
    this.codeToId.set(code, roomId);

    return room;
  }

  getByCode(code: string): Room | undefined {
    const id = this.codeToId.get(code);

    return id ? this.byId.get(id) : undefined;
  }

  deleteRoom(roomId: string): void {
    const room = this.byId.get(roomId);
    if (!room) return;

    this.codeToId.delete(room.meta.roomCode);
    this.byId.delete(roomId);
  }
}
