import type { roomParticipant } from "@ciderjams/proto";
import type { App } from "@ciderjams/server/app";
import { treaty, type Treaty } from "@elysia/eden";

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
  return ciderJamsApi().ws.subscribe({ query } as never);
}

export type CiderSyncSocket = ReturnType<typeof ciderSyncSocket>;
