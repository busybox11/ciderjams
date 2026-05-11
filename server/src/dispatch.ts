import {
  clientEventPayloads,
  type ClientEvent,
  type roomParticipant,
  type ServerEvent,
  type ServerEventPayloadMap,
} from "@ciderjams/proto";
import type { RoomRegistry } from "./registry";
import type { Room } from "./room";

export type ServerMessage = {
  [E in ServerEvent]: { event: E; payload: ServerEventPayloadMap[E] };
}[ServerEvent];

export function fullSync(room: Room): ServerMessage[] {
  return [
    { event: "room.state", payload: room.roomStatePayload() },
    { event: "queue.state", payload: room.queueStatePayload() },
    { event: "player.state", payload: room.playerStatePayload() },
  ];
}

export function createRoomOp(
  registry: RoomRegistry,
  rawPayload: unknown,
): { room: Room; toHost: ServerMessage[] } {
  const parsed = clientEventPayloads["room.create"].safeParse(rawPayload);

  if (!parsed.success) throw new Error("room.create: invalid payload");

  const room = registry.createRoom(parsed.data.user);

  return { room, toHost: fullSync(room) };
}

type JoinRoomResOk = { ok: true; room: Room; toJoiner: ServerMessage[] };
type JoinRoomResNotOk = { ok: false; reason: "invalid_payload" | "not_found" };
export function joinRoomOp(
  registry: RoomRegistry,
  rawPayload: unknown,
  user: roomParticipant,
): JoinRoomResOk | JoinRoomResNotOk {
  const parsed = clientEventPayloads["room.join"].safeParse(rawPayload);
  if (!parsed.success) return { ok: false, reason: "invalid_payload" };

  const room = registry.getByCode(parsed.data.roomCode);
  if (!room) return { ok: false, reason: "not_found" };

  room.join(user);
  return { ok: true, room, toJoiner: fullSync(room) };
}

export function applyInRoom(
  registry: RoomRegistry,
  room: Room,
  event: ClientEvent,
  rawPayload: unknown,
  actorId: string,
): { messages: ServerMessage[]; roomClosed?: true } {
  if (event === "room.create" || event === "room.join") {
    throw new Error(
      "use createRoomOp / joinRoomOp for room.create and room.join",
    );
  }

  switch (event) {
    case "ping": {
      const parsed = clientEventPayloads.ping.safeParse(rawPayload);
      if (!parsed.success) throw new Error("ping: invalid payload");

      return { messages: [{ event: "ping", payload: parsed.data }] };
    }

    case "room.leave": {
      const parsed = clientEventPayloads["room.leave"].safeParse(rawPayload);
      if (!parsed.success) throw new Error("room.leave: invalid payload");

      void parsed.data;
      const roomId = room.meta.roomId;
      room.leave(actorId);

      if (room.isEmpty) {
        registry.deleteRoom(roomId);
        return { messages: [], roomClosed: true };
      }

      return { messages: fullSync(room) };
    }

    case "queue.set": {
      const parsed = clientEventPayloads["queue.set"].safeParse(rawPayload);
      if (!parsed.success) throw new Error("queue.set: invalid payload");

      room.setQueue(actorId, parsed.data);

      return { messages: fullSync(room) };
    }

    case "player.play": {
      const parsed = clientEventPayloads["player.play"].safeParse(rawPayload);
      if (!parsed.success) throw new Error("player.play: invalid payload");

      void parsed.data;
      room.play(actorId);

      return { messages: fullSync(room) };
    }

    case "player.pause": {
      const parsed = clientEventPayloads["player.pause"].safeParse(rawPayload);
      if (!parsed.success) throw new Error("player.pause: invalid payload");

      void parsed.data;
      room.pause(actorId);

      return { messages: fullSync(room) };
    }

    case "player.seek": {
      const parsed = clientEventPayloads["player.seek"].safeParse(rawPayload);
      if (!parsed.success) throw new Error("player.seek: invalid payload");

      room.seek(actorId, parsed.data.positionMs);

      return { messages: fullSync(room) };
    }

    case "player.next": {
      const parsed = clientEventPayloads["player.next"].safeParse(rawPayload);
      if (!parsed.success) throw new Error("player.next: invalid payload");

      void parsed.data;
      room.next(actorId);

      return { messages: fullSync(room) };
    }

    case "player.previous": {
      const parsed =
        clientEventPayloads["player.previous"].safeParse(rawPayload);
      if (!parsed.success) throw new Error("player.previous: invalid payload");

      void parsed.data;
      room.previous(actorId);

      return { messages: fullSync(room) };
    }

    case "player.setRepeat": {
      const parsed =
        clientEventPayloads["player.setRepeat"].safeParse(rawPayload);
      if (!parsed.success) throw new Error("player.setRepeat: invalid payload");

      room.setRepeat(actorId, parsed.data.repeatMode);

      return { messages: fullSync(room) };
    }

    case "player.setShuffle": {
      const parsed =
        clientEventPayloads["player.setShuffle"].safeParse(rawPayload);
      if (!parsed.success)
        throw new Error("player.setShuffle: invalid payload");

      room.setShuffle(actorId, parsed.data.shuffleMode);

      return { messages: fullSync(room) };
    }

    default: {
      const _exhaustive: never = event;
      throw new Error(`unhandled event: ${_exhaustive}`);
    }
  }
}
