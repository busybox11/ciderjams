import type { PlayerStateSchema, QueueStateSchema } from "./payloads";

import * as z from "zod";

/** Row shape MusicKit expects when building a SharePlay guest queue snapshot. */
export const sharePlaySyncQueueRowSchema = z.object({
  id: z.string(),
  type: z.string().optional(),
  attributes: z
    .object({
      playParams: z.record(z.string(), z.unknown()).optional(),
    })
    .catchall(z.unknown()),
});

export type SharePlaySyncQueueRow = z.infer<typeof sharePlaySyncQueueRowSchema>;

/** Guest SharePlay inhibitor `syncFromServer` input (Apple Music web wire-ish JSON). */
export const sharePlaySyncInputSchema = z.object({
  queue: z.array(sharePlaySyncQueueRowSchema),
  index: z.number().optional(),
  currentPlayingIndex: z.number().optional(),
  elapsedTime: z.number().optional(),
  playbackState: z.number().optional(),
  state: z.number().optional(),
  repeatMode: z.number().optional(),
  shuffleMode: z.number().optional(),
  autoPlay: z.boolean().optional(),
  volume: z.number().optional(),
});

export type SharePlaySyncInput = z.infer<typeof sharePlaySyncInputSchema>;

function sharePlayPlaybackNumber(player: PlayerStateSchema): number {
  if (!player.isPlaying) return 0;
  return player.playbackState === "FULL_PLAYBACK_ONLY" ||
    player.playbackState === "SHAREPLAY_PARTICIPANT"
    ? 2
    : 0;
}

function sharePlayRepeatNumber(repeatMode: PlayerStateSchema["repeatMode"]): number {
  const m: Record<PlayerStateSchema["repeatMode"], number> = {
    REPEAT_OFF: 0,
    REPEAT_ALL: 1,
    REPEAT_ONE: 2,
  };
  return m[repeatMode] ?? 0;
}

function sharePlayShuffleNumber(shuffleMode: PlayerStateSchema["shuffleMode"]): number {
  return shuffleMode === "SHUFFLE_ON" ? 1 : 0;
}

/** Jam server queue + player → SharePlay guest sync payload. */
export function jamPlaybackToSharePlayPayload(
  queue: QueueStateSchema,
  player: PlayerStateSchema,
): SharePlaySyncInput {
  return {
    queue: queue.map((e) => ({
      id: e.itemCatalogId,
      type: "songs",
      attributes: {
        playParams: { id: e.itemCatalogId, kind: "song" },
      },
    })),
    index: player.currentPlayingIndex,
    currentPlayingIndex: player.currentPlayingIndex,
    elapsedTime: player.elapsedTimeMs,
    playbackState: sharePlayPlaybackNumber(player),
    repeatMode: sharePlayRepeatNumber(player.repeatMode),
    shuffleMode: sharePlayShuffleNumber(player.shuffleMode),
    autoPlay: player.autoPlay,
  };
}
