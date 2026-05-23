import * as z from "zod";

import {
  type ClientEvent,
  type ClientEventPayloadMap,
  clientEventPayloads,
  type ServerEvent,
  type ServerEventPayloadMap,
  serverEventPayloads,
} from "./payloads";

const clientBranches = (Object.keys(clientEventPayloads) as ClientEvent[]).map((event) =>
  z.object({
    event: z.literal(event),
    payload: clientEventPayloads[event],
  }),
);

// simplest way i could think of to keep inference with a list of schemas
// without reinventing the wheel. ugh but fine i guess
export const clientWireMessageSchema = z.union(
  clientBranches as unknown as [
    (typeof clientBranches)[number],
    (typeof clientBranches)[number],
    ...(typeof clientBranches)[number][],
  ],
);

export type ClientWireMessage = {
  [K in ClientEvent]: { event: K; payload: ClientEventPayloadMap[K] };
}[ClientEvent];

export function parseClientWireMessage(
  raw: unknown,
): { ok: true; message: ClientWireMessage } | { ok: false; error: z.ZodError } {
  const r = clientWireMessageSchema.safeParse(raw);
  if (!r.success) return { ok: false, error: r.error };
  return { ok: true, message: r.data as ClientWireMessage };
}

const serverBranches = (Object.keys(serverEventPayloads) as ServerEvent[]).map((event) =>
  z.object({
    event: z.literal(event),
    payload: serverEventPayloads[event],
  }),
);

export const serverWireMessageSchema = z.union(
  serverBranches as unknown as [
    (typeof serverBranches)[number],
    (typeof serverBranches)[number],
    ...(typeof serverBranches)[number][],
  ],
);

export type ServerWireMessage = {
  [K in ServerEvent]: { event: K; payload: ServerEventPayloadMap[K] };
}[ServerEvent];

export function parseServerWireMessage(
  raw: unknown,
): { ok: true; message: ServerWireMessage } | { ok: false; error: z.ZodError } {
  const r = serverWireMessageSchema.safeParse(raw);
  if (!r.success) return { ok: false, error: r.error };
  return { ok: true, message: r.data as ServerWireMessage };
}

export const wireErrorMessage = z.object({
  type: z.literal("error"),
  message: z.string(),
});
export type WireErrorMessage = z.infer<typeof wireErrorMessage>;

export const outboundWsMessageSchema = wireErrorMessage.or(serverWireMessageSchema);

export type OutboundWsMessage = z.infer<typeof outboundWsMessageSchema>;
