import type { roomParticipant } from "@ciderjams/proto";
import type { App } from "@ciderjams/server/app";
import { treaty, type Treaty } from "@elysia/eden";

const DEFAULT_BASE = "http://0.0.0.0:8787";

function normalizeBase(url: string): string {
  return url.replace(/\/$/, "");
}

export function ciderJamsApi(
  baseUrl: string = DEFAULT_BASE,
): Treaty.Create<App> {
  return treaty<App>(normalizeBase(baseUrl));
}

export function ciderHealth(baseUrl?: string) {
  return ciderJamsApi(baseUrl).get();
}

export function ciderSyncSocket(
  baseUrl: string = DEFAULT_BASE,
  query: roomParticipant,
) {
  return ciderJamsApi(baseUrl).ws.subscribe({ query } as never);
}

export type CiderSyncSocket = ReturnType<typeof ciderSyncSocket>;
