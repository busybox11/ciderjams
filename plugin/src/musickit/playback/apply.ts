import type { PlayerStateSchema, QueueStateSchema } from "@ciderjams/proto";

import { createLogger } from "@ciderjams/proto";

import { applyRepeatModeToMusicKit, applyShuffleModeToMusicKit } from "../payloads";

const log = createLogger("plugin", "musickit/playback/apply");

const SEEK_DRIFT_MS = 500;

function clampIndex(index: number, queueLength: number): number {
  if (queueLength <= 0) return 0;
  return Math.min(Math.max(0, index), queueLength - 1);
}

export function stopMusicKitIfQueueEmpty(music: MusicKit.MusicKitInstanceLoose): void {
  if (music.isPlaying || (music.nowPlayingItemIndex ?? -1) !== -1) {
    log.debug("empty queue — stopping local player");
    music.clearQueue();
    music.stop();
  }
}

export async function applyServerPlaybackToMusicKit(
  music: MusicKit.MusicKitInstanceLoose,
  queue: QueueStateSchema,
  player: PlayerStateSchema,
): Promise<void> {
  if (queue.length === 0) {
    stopMusicKitIfQueueEmpty(music);
    return;
  }

  const index = clampIndex(player.currentPlayingIndex, queue.length);
  const targetCatalogId = queue[index]?.itemCatalogId;
  const nowPlayingCatalogId =
    music.nowPlayingItem?.attributes?.playParams?.catalogId ??
    String(music.nowPlayingItem?.id ?? "");

  applyRepeatModeToMusicKit(music, player.repeatMode);
  applyShuffleModeToMusicKit(music, player.shuffleMode);
  music.autoplayEnabled = player.autoPlay;

  if (
    music.nowPlayingItemIndex !== index ||
    (targetCatalogId && nowPlayingCatalogId !== targetCatalogId)
  ) {
    await music.changeToMediaAtIndex(index);
  }

  const seekSec = Math.max(0, player.elapsedTimeMs) / 1000;
  const localSec = music.currentPlaybackTime ?? 0;
  if (Math.abs(localSec - seekSec) * 1000 > SEEK_DRIFT_MS) {
    await music.seekToTime(seekSec);
  }

  if (player.isPlaying) {
    if (!music.isPlaying) await music.play();
  } else if (music.isPlaying) {
    await music.pause();
  }
}
