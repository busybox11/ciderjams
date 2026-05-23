import type { ClientWireMessage, roomParticipant } from "@ciderjams/proto";
import type { App } from "@ciderjams/server/app";

import { type Treaty, treaty } from "@elysia/eden";

import { clientWireMessageSchema, createLogger } from "@ciderjams/proto";

import { getApiBaseUrl } from "./api-base-url";

const log = createLogger("plugin", "api");

export function ciderJamsApi(): Treaty.Create<App> {
  return treaty<App>(getApiBaseUrl());
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
