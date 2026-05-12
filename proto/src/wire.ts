import * as z from "zod";
import {
  clientEventPayloads,
  serverEventPayloads,
  type ClientEvent,
  type ClientEventPayloadMap,
  type ServerEvent,
  type ServerEventPayloadMap,
} from "./payloads";

const clientEventTuple = Object.keys(
  clientEventPayloads,
) as unknown as readonly [ClientEvent, ...ClientEvent[]];

export const clientWireStruct = z.object({
  event: z.enum(clientEventTuple),
  payload: z.unknown(),
});

export type ClientWireMessage = {
  [K in ClientEvent]: { event: K; payload: ClientEventPayloadMap[K] };
}[ClientEvent];

export function parseClientWireMessage(
  raw: unknown,
): { ok: true; message: ClientWireMessage } | { ok: false; error: z.ZodError } {
  const struct = clientWireStruct.safeParse(raw);
  if (!struct.success) return { ok: false, error: struct.error };

  const { event, payload } = struct.data;
  const parsedPayload = clientEventPayloads[event].safeParse(payload);
  if (!parsedPayload.success) return { ok: false, error: parsedPayload.error };

  return {
    ok: true,
    message: { event, payload: parsedPayload.data } as ClientWireMessage,
  };
}

export const serverWireStruct = z.object({
  event: z.enum(
    Object.keys(serverEventPayloads) as unknown as [
      ServerEvent,
      ...ServerEvent[],
    ],
  ),
  payload: z.unknown(),
});

export type ServerWireMessage = {
  [K in ServerEvent]: { event: K; payload: ServerEventPayloadMap[K] };
}[ServerEvent];

export function parseServerWireMessage(
  raw: unknown,
): { ok: true; message: ServerWireMessage } | { ok: false; error: z.ZodError } {
  const struct = serverWireStruct.safeParse(raw);
  if (!struct.success) return { ok: false, error: struct.error };

  const { event, payload } = struct.data;
  const parsedPayload = serverEventPayloads[event].safeParse(payload);
  if (!parsedPayload.success) return { ok: false, error: parsedPayload.error };

  return {
    ok: true,
    message: { event, payload: parsedPayload.data } as ServerWireMessage,
  };
}

export const wireErrorMessage = z.object({
  type: z.literal("error"),
  message: z.string(),
});
export type WireErrorMessage = z.infer<typeof wireErrorMessage>;
