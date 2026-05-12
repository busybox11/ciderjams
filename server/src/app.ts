import {
  clientWireMessageSchema,
  outboundWsMessageSchema,
  roomParticipant,
  type ClientWireMessage,
} from "@ciderjams/proto";
import { Elysia } from "elysia";
import { RoomRegistry } from "./registry";
import { RoomSocketHub, type HubSocket } from "./room-sockets";

const registry = new RoomRegistry();
const hub = new RoomSocketHub();

function asHubSocket(ws: unknown): HubSocket {
  return ws as HubSocket;
}

export const app = new Elysia()
  .get("/", () => "ciderjams sync\n")
  .ws("/ws", {
    query: roomParticipant,
    body: clientWireMessageSchema,
    response: outboundWsMessageSchema,
    open(ws) {
      hub.init(asHubSocket(ws), ws.data.query);
    },
    message(ws, msg) {
      hub.onMessage(asHubSocket(ws), registry, msg as ClientWireMessage);
    },
    close(ws) {
      hub.onDisconnect(asHubSocket(ws), registry);
    },
  });

export type App = typeof app;
