import {
  clientWireMessageSchema,
  roomParticipant,
  type ClientWireMessage,
} from "@ciderjams/proto";
import { Elysia, ValidationError } from "elysia";
import { log } from "./logger";
import { RoomRegistry } from "./registry";
import { RoomSocketHub, type HubSocket } from "./room-sockets";

const registry = new RoomRegistry();
const hub = new RoomSocketHub();

/** underlying bun ServerWebSocket: Elysia wraps it in a new ElysiaWS per callback, so hub WeakMap keys must use raw */
function asHubSocket(ws: { raw: HubSocket } | HubSocket): HubSocket {
  return typeof ws === "object" && ws !== null && "raw" in ws
    ? (ws.raw as HubSocket)
    : (ws as HubSocket);
}

export const app = new Elysia()
  .get("/", () => "ciderjams sync\n")
  .ws("/ws", {
    query: roomParticipant,
    body: clientWireMessageSchema,
    error({ error }) {
      if (error instanceof ValidationError) {
        log.warn("ws message rejected", error.message);
        return { type: "error" as const, message: "invalid wire message" };
      }
    },
    open(ws) {
      hub.init(asHubSocket(ws), ws.data.query);
    },
    message(ws, msg) {
      const user = ws.data.query;
      log.log("ws ←", `@${user.handle}: ${msg.event}`);

      try {
        hub.onMessage(asHubSocket(ws), registry, msg as ClientWireMessage);
      } catch (e) {
        log.error("ws handler error", e instanceof Error ? e.message : e);
        hub.error(asHubSocket(ws), "server error");
      }
    },
    close(ws) {
      hub.onDisconnect(asHubSocket(ws), registry);
    },
  });

export type App = typeof app;
