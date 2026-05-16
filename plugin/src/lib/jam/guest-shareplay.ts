import type {
  PlayerStateSchema,
  QueueStateSchema,
} from "@ciderjams/proto";

import type { SharePlaySyncInput } from "../../shareplay/types";

function sharePlayPlaybackNumber(player: PlayerStateSchema): number {
  if (!player.isPlaying) return 0;
  return player.playbackState === "FULL_PLAYBACK_ONLY" ||
    player.playbackState === "SHAREPLAY_PARTICIPANT"
    ? 2
    : 0;
}

function sharePlayRepeatNumber(
  repeatMode: PlayerStateSchema["repeatMode"],
): number {
  const m: Record<PlayerStateSchema["repeatMode"], number> = {
    REPEAT_OFF: 0,
    REPEAT_ALL: 1,
    REPEAT_ONE: 2,
  };
  return m[repeatMode] ?? 0;
}

function sharePlayShuffleNumber(
  shuffleMode: PlayerStateSchema["shuffleMode"],
): number {
  return shuffleMode === "SHUFFLE_ON" ? 1 : 0;
}

/** Minimal MusicKit-like queue rows from server `queueEntry` list. */
export function jamQueueToSharePlayQueue(queue: QueueStateSchema) {
  return queue.map((e) => ({
    id: e.itemCatalogId,
    type: "songs",
    attributes: {
      playParams: { id: e.itemCatalogId, kind: "song" },
    },
  }));
}

export function jamPlaybackToSharePlayPayload(
  queue: QueueStateSchema,
  player: PlayerStateSchema,
): SharePlaySyncInput {
  return {
    queue: jamQueueToSharePlayQueue(queue),
    index: player.currentPlayingIndex,
    currentPlayingIndex: player.currentPlayingIndex,
    elapsedTime: player.elapsedTimeMs,
    playbackState: sharePlayPlaybackNumber(player),
    repeatMode: sharePlayRepeatNumber(player.repeatMode),
    shuffleMode: sharePlayShuffleNumber(player.shuffleMode),
    autoPlay: player.autoPlay,
  };
}
