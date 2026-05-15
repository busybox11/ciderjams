/**
 * The following events will be used to communicate from a client to the server:
 *
 * - ping
 * - room.create
 * - room.join
 * - room.leave
 * - queue.set
 * - player.play
 * - player.pause
 * - player.seek
 * - player.next
 * - player.previous
 * - player.setRepeat
 * - player.setShuffle
 * - player.host.sync
 *
 *
 * The following events will be used to communicate from the server to the client:
 *
 * - ping
 * - room.state
 * - queue.state
 * - player.state
 *
 * We define payloads using Zod schemas, which will also export type definitions for the payloads.
 */

import * as z from "zod";
import {
  playerRepeatMode,
  playerShuffleMode,
  queueEntry,
  roomMeta,
  roomPlaybackState,
} from "./room";

export const pingPayload = z.object({});
export type PingPayload = z.infer<typeof pingPayload>;

/** Client → server: catalog IDs only; server assigns queueEntryId / ownerUserId on create. */

export const basePlaybackStateSchema = roomPlaybackState.omit({
  updatedAtMs: true,
});
export type BasePlaybackState = z.infer<typeof basePlaybackStateSchema>;

export const roomCreatePayload = z.object({
  playbackState: basePlaybackStateSchema.extend({
    queue: z.array(queueEntry.omit({ ownerUserId: true, queueEntryId: true })),
  }),
});
export type RoomCreatePayload = z.infer<typeof roomCreatePayload>;

export const roomJoinPayload = z.object({
  roomCode: roomMeta.shape.roomCode,
});
export type RoomJoinPayload = z.infer<typeof roomJoinPayload>;

export const roomLeavePayload = z.object({});
export type RoomLeavePayload = z.infer<typeof roomLeavePayload>;

export const queueSetPayload = z.array(
  queueEntry.extend({
    queueEntryId: queueEntry.shape.queueEntryId
      .optional()
      .describe("Unset when a new track is added to the queue"),
    ownerUserId: queueEntry.shape.ownerUserId
      .optional()
      .describe("Unset when a new track is added to the queue"),
  }),
);
export type QueueSetPayload = z.infer<typeof queueSetPayload>;

export const playerPlayPayload = z.object({});
export type PlayerPlayPayload = z.infer<typeof playerPlayPayload>;

export const playerPausePayload = z.object({});
export type PlayerPausePayload = z.infer<typeof playerPausePayload>;

export const playerSeekPayload = z.object({
  positionMs: z.number(),
});
export type PlayerSeekPayload = z.infer<typeof playerSeekPayload>;

export const playerNextPayload = z.object({});
export type PlayerNextPayload = z.infer<typeof playerNextPayload>;

export const playerPreviousPayload = z.object({});
export type PlayerPreviousPayload = z.infer<typeof playerPreviousPayload>;

export const playerSetRepeatPayload = z.object({
  repeatMode: playerRepeatMode,
});
export type PlayerSetRepeatPayload = z.infer<typeof playerSetRepeatPayload>;

export const playerSetShufflePayload = z.object({
  shuffleMode: playerShuffleMode,
});
export type PlayerSetShufflePayload = z.infer<typeof playerSetShufflePayload>;

export const clientEventPayloads = {
  ping: pingPayload,
  "room.create": roomCreatePayload,
  "room.join": roomJoinPayload,
  "room.leave": roomLeavePayload,
  "queue.set": queueSetPayload,
  "player.play": playerPlayPayload,
  "player.pause": playerPausePayload,
  "player.seek": playerSeekPayload,
  "player.next": playerNextPayload,
  "player.previous": playerPreviousPayload,
  "player.setRepeat": playerSetRepeatPayload,
  "player.setShuffle": playerSetShufflePayload,
} as const;

export type ClientEvent = keyof typeof clientEventPayloads;

export type ClientEventPayloadMap = {
  [K in ClientEvent]: z.infer<(typeof clientEventPayloads)[K]>;
};

export const roomStateSchema = roomMeta.omit({
  playbackState: true,
});
export type RoomStateSchema = z.infer<typeof roomStateSchema>;

export const queueStateSchema = z.array(queueEntry);
export type QueueStateSchema = z.infer<typeof queueStateSchema>;

export const playerStateSchema = roomPlaybackState.omit({
  queue: true,
});
export type PlayerStateSchema = z.infer<typeof playerStateSchema>;

export const serverEventPayloads = {
  ping: pingPayload,
  "room.state": roomStateSchema,
  "queue.state": queueStateSchema,
  "player.state": playerStateSchema,
} as const;

export type ServerEvent = keyof typeof serverEventPayloads;

export type ServerEventPayloadMap = {
  [K in ServerEvent]: z.infer<(typeof serverEventPayloads)[K]>;
};
