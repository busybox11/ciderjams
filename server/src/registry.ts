import type { roomParticipant } from "@ciderjams/proto";
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
    code += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length]!;
  }

  return code;
}

export class RoomRegistry {
  readonly byId = new Map<string, Room>();
  readonly codeToId = new Map<string, string>();

  createRoom(host: roomParticipant): Room {
    const roomId = newRoomId();
    let code = randomRoomCode();
    while (this.codeToId.has(code)) code = randomRoomCode();

    const room = Room.create(host, roomId, code);
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
