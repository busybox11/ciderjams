import { parseClientWireMessage, roomParticipant } from "@ciderjams/proto";
import { Elysia } from "elysia";
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

function wsEventLabel(msg: unknown): string {
  if (
    msg !== null &&
    typeof msg === "object" &&
    "event" in msg &&
    typeof (msg as { event: unknown }).event === "string"
  ) {
    return (msg as { event: string }).event;
  }
  return typeof msg === "object" ? "(no event field)" : typeof msg;
}

export const app = new Elysia()
  .get("/", () => "ciderjams sync\n")
  .ws("/ws", {
    query: roomParticipant,
    /* Parse in `message` instead of `body:` so rejects are logged and the client gets an error frame. */
    open(ws) {
      hub.init(asHubSocket(ws), ws.data.query);
    },
    message(ws, msg) {
      log.log("ws ←", wsEventLabel(msg));
      try {
        const parsed = parseClientWireMessage(msg);
        if (!parsed.ok) {
          const detail = parsed.error.issues
            .slice(0, 5)
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ");
          log.warn("ws message rejected", detail || parsed.error.message);
          hub.error(asHubSocket(ws), "invalid wire message");
          return;
        }
        hub.onMessage(asHubSocket(ws), registry, parsed.message);
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
