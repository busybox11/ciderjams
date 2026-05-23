import type { RoomRegistry } from "./registry";
import type { Room } from "./room";

import {
  type ClientEvent,
  type ClientEventPayloadMap,
  clientEventPayloads,
  type roomParticipant,
  type ServerEvent,
  type ServerEventPayloadMap,
} from "@ciderjams/proto";

export type ServerMessage = {
  [E in ServerEvent]: { event: E; payload: ServerEventPayloadMap[E] };
}[ServerEvent];

/* base socket broadcast event shapes used for scoped syncing */
export function fullSync(room: Room): ServerMessage[] {
  return [roomSlice(room), queueSlice(room), playerSlice(room)];
}

export function roomSlice(room: Room): ServerMessage {
  return { event: "room.state", payload: room.roomStatePayload() };
}

export function queueSlice(room: Room): ServerMessage {
  return { event: "queue.state", payload: room.queueStatePayload() };
}

export function playerSlice(room: Room): ServerMessage {
  return { event: "player.state", payload: room.playerStatePayload() };
}

function invalidPayload(event: ClientEvent): Error {
  return new Error(`${event}: invalid payload`);
}

function parseClientPayload<E extends keyof typeof clientEventPayloads>(
  event: E,
  raw: unknown,
): ClientEventPayloadMap[E] {
  const parsed = clientEventPayloads[event].safeParse(raw);
  if (!parsed.success) throw invalidPayload(event as ClientEvent);
  return parsed.data as ClientEventPayloadMap[E];
}

export function createRoomOp(
  registry: RoomRegistry,
  user: roomParticipant,
  rawPayload: unknown,
): { room: Room; toHost: ServerMessage[] } {
  const { playbackState } = parseClientPayload("room.create", rawPayload);
  const room = registry.createRoom(user, playbackState);
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

/*
 * only send room meta updates to existing room members on a new join
 * no need to re-sync the whole room state
 */
export function joinBroadcastToExisting(room: Room): ServerMessage[] {
  return [roomSlice(room)];
}

export type ApplyInRoomResult = {
  messages: ServerMessage[];
  roomClosed?: true;
};

type InRoomEvent = Exclude<ClientEvent, "room.create" | "room.join">;

type InRoomHandlerCtx = {
  registry: RoomRegistry;
  room: Room;
  rawPayload: unknown;
  actorId: string;
};

type InRoomHandler = (ctx: InRoomHandlerCtx) => ApplyInRoomResult;

type PlayerCommandEvent =
  | "player.play"
  | "player.pause"
  | "player.seek"
  | "player.next"
  | "player.previous"
  | "player.setRepeat"
  | "player.setShuffle"
  | "player.host.sync";

function playerCommand<E extends PlayerCommandEvent>(
  event: E,
  run: (room: Room, actorId: string, data: ClientEventPayloadMap[E]) => void,
): InRoomHandler {
  return ({ room, rawPayload, actorId }) => {
    const data = parseClientPayload(event, rawPayload);
    run(room, actorId, data);
    return { messages: [playerSlice(room)] };
  };
}

function queuePlayerCommand(
  run: (room: Room, actorId: string, data: ClientEventPayloadMap["queue.set"]) => void,
): InRoomHandler {
  return ({ room, rawPayload, actorId }) => {
    const data = parseClientPayload("queue.set", rawPayload);
    run(room, actorId, data);
    return { messages: [queueSlice(room)] };
  };
}

const inRoomHandlers: Record<InRoomEvent, InRoomHandler> = {
  ping: ({ rawPayload, room, actorId }) => {
    void room;
    void actorId;
    const data = parseClientPayload("ping", rawPayload);
    return { messages: [{ event: "ping", payload: data }] };
  },

  "room.leave": ({ registry, room, rawPayload, actorId }) => {
    void parseClientPayload("room.leave", rawPayload);

    const roomId = room.meta.roomId;
    room.leave(actorId);

    if (room.isEmpty) {
      registry.deleteRoom(roomId);
      return { messages: [], roomClosed: true };
    }

    return { messages: [roomSlice(room)] };
  },

  "queue.set": queuePlayerCommand((room, actorId, data) => {
    room.setQueue(actorId, data);
  }),

  "player.play": playerCommand("player.play", (room, actorId, _data) => {
    room.play(actorId);
  }),

  "player.pause": playerCommand("player.pause", (room, actorId, _data) => {
    room.pause(actorId);
  }),

  "player.seek": playerCommand("player.seek", (room, actorId, data) => {
    room.seek(actorId, data.positionMs);
  }),

  "player.next": playerCommand("player.next", (room, actorId, _data) => {
    room.next(actorId);
  }),

  "player.previous": playerCommand("player.previous", (room, actorId, _data) => {
    room.previous(actorId);
  }),

  "player.setRepeat": playerCommand("player.setRepeat", (room, actorId, data) => {
    room.setRepeat(actorId, data.repeatMode);
  }),

  "player.setShuffle": playerCommand("player.setShuffle", (room, actorId, data) => {
    room.setShuffle(actorId, data.shuffleMode);
  }),

  "player.host.sync": playerCommand("player.host.sync", (room, actorId, data) => {
    room.hostSync(actorId, data.playbackState);
  }),
};

export function applyInRoom(
  registry: RoomRegistry,
  room: Room,
  event: ClientEvent,
  rawPayload: unknown,
  actorId: string,
): ApplyInRoomResult {
  if (event === "room.create" || event === "room.join") {
    throw new Error("use createRoomOp / joinRoomOp for room.create and room.join");
  }

  return inRoomHandlers[event as InRoomEvent]({
    registry,
    room,
    rawPayload,
    actorId,
  });
}
