import type { ClientWireMessage, roomParticipant } from "@ciderjams/proto";
import type { App } from "@ciderjams/server/app";

import { type Treaty, treaty } from "@elysia/eden";

import { clientWireMessageSchema, createLogger } from "@ciderjams/proto";

const log = createLogger("plugin", "api");

const API_BASE_URL = "http://0.0.0.0:8787";

function normalizeBase(url: string): string {
  return url.replace(/\/$/, "");
}

export function ciderJamsApi(): Treaty.Create<App> {
  return treaty<App>(normalizeBase(API_BASE_URL));
}

export function ciderHealth() {
  return ciderJamsApi().get();
}

export function ciderSyncSocket(query: roomParticipant) {
  const sub = ciderJamsApi().v1.ws.subscribe({ query } as never);

  // not a huge fan of this, easiest way to have keyed type inference with schemas
  // todo: find a better way
  const sendRaw = sub.send.bind(sub);
  return Object.assign(sub, {
    send(message: ClientWireMessage) {
      try {
        log.debug("sending wire message", message);
        return sendRaw(clientWireMessageSchema.parse(message) as never);
      } catch (error) {
        log.error("Failed to parse client wire message:", error);
        log.debug("wire message", message);
        throw error;
      }
    },
  });
}

export type CiderSyncSocket = ReturnType<typeof ciderSyncSocket>;
