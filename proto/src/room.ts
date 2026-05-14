import * as z from "zod";

/* MusicKit like shapes */
export const CatalogItemId = z.string();
export const LibraryItemId = z.string();

export const playbackState = z.enum([
  "PREVIEW_ONLY",
  "MIXED_CONTENT",
  "FULL_PLAYBACK_ONLY",
  "SHAREPLAY_PARTICIPANT",
]);
export type playbackState = z.infer<typeof playbackState>;

export const playerRepeatMode = z.enum([
  "REPEAT_ALL",
  "REPEAT_OFF",
  "REPEAT_ONE",
]);
export type PlayerRepeatMode = z.infer<typeof playerRepeatMode>;

export const playerShuffleMode = z.enum(["SHUFFLE_OFF", "SHUFFLE_ON"]);
export type PlayerShuffleMode = z.infer<typeof playerShuffleMode>;

/* Internal shapes */
export const queueEntry = z.object({
  queueEntryId: z.string().describe("Server-generated internal queue item ID"),
  ownerUserId: z.string(),
  itemCatalogId: CatalogItemId,
});
export type queueEntry = z.infer<typeof queueEntry>;

export const roomPlaybackState = z.object({
  queue: z.array(queueEntry),
  currentPlayingIndex: z.int(),
  elapsedTimeMs: z.number(),
  playbackState: playbackState,
  repeatMode: playerRepeatMode,
  shuffleMode: playerShuffleMode,
  autoPlay: z.boolean(),
  updatedAtMs: z.int(), // should probably use better time primitives, will figure out later
});
export type RoomPlaybackState = z.infer<typeof roomPlaybackState>;

export const roomParticipant = z.object({
  userId: z.string().describe("Apple Music social profile user ID"),
  name: z.string(),
  handle: z.string(),
  avatar: z.url(),
});
export type roomParticipant = z.infer<typeof roomParticipant>;

export const roomMeta = z.object({
  roomId: z.string().describe("Server-generated internal room ID"),
  roomCode: z.string().describe("User-friendly room joining code"), // should probably use stricter zod-defined shapes instead
  hostUserId: roomParticipant.shape.userId,
  participants: z.array(roomParticipant),
  playbackState: roomPlaybackState,
});
export type roomMeta = z.infer<typeof roomMeta>;
