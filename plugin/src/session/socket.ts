import type {
  PlayerStateSchema,
  QueueStateSchema,
  RoomStateSchema,
  roomParticipant,
} from "@ciderjams/proto";

import { outboundWsMessageSchema } from "@ciderjams/proto";

import { type CiderSyncSocket, ciderSyncSocket } from "../api/client";
import { log } from "../lib/logger";
import { waitForWebSocketOpen } from "./host/session";

export type JamSocketHandlers = {
  onRoomState: (payload: RoomStateSchema) => void;
  onQueueState: (payload: QueueStateSchema) => void;
  onPlayerState: (payload: PlayerStateSchema) => void;
  onSocketError: (rawMessage: string) => void;
};

export function handleJamSocketMessage(data: unknown, handlers: JamSocketHandlers) {
  const parsed = outboundWsMessageSchema.safeParse(data);
  if (!parsed.success) {
    log.warn("Jam socket: bad inbound frame", parsed.error.issues.slice(0, 3));
    return;
  }
  log.debug("onSocketMessage", parsed.data);

  const msg = parsed.data;
  if ("type" in msg) {
    log.error("Jam socket error:", msg.message);
    handlers.onSocketError(msg.message);
    return;
  }

  switch (msg.event) {
    case "room.state":
      handlers.onRoomState(msg.payload as RoomStateSchema);
      break;
    case "queue.state":
      handlers.onQueueState(msg.payload as QueueStateSchema);
      break;
    case "player.state":
      handlers.onPlayerState(msg.payload as PlayerStateSchema);
      break;
    default:
      break;
  }
}

export async function connectJamSocket(
  identity: roomParticipant,
  handlers: JamSocketHandlers,
): Promise<CiderSyncSocket> {
  const client = ciderSyncSocket(identity);
  client.subscribe((ev) => handleJamSocketMessage(ev.data, handlers));
  await waitForWebSocketOpen(client);
  return client;
}
