import type {
  PlayerStateSchema,
  QueueStateSchema,
} from "@ciderjams/proto";
import { createLogger } from "@ciderjams/proto";

import {
  applyRepeatModeToMusicKit,
  applyShuffleModeToMusicKit,
  jamQueueCatalogIds,
} from "../musickit/payloads";

const log = createLogger("plugin", "jam/apply-playback");

const SEEK_DRIFT_MS = 500;

function clampIndex(index: number, queueLength: number): number {
  if (queueLength <= 0) return 0;
  return Math.min(Math.max(0, index), queueLength - 1);
}

/** Apply server `player.state` to MusicKit without a SharePlay queue rebuild. */
export async function applyJamPlaybackFromServer(
  music: MusicKit.MusicKitInstanceLoose,
  queue: QueueStateSchema,
  player: PlayerStateSchema,
): Promise<void> {
  if (queue.length === 0) {
    if (music.isPlaying || (music.nowPlayingItemIndex ?? -1) !== -1) {
      log.debug("empty jam queue — stopping local player");
      music.clearQueue();
      music.stop();
    }
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

export function jamQueueCatalogOrderChanged(
  prev: QueueStateSchema | null,
  next: QueueStateSchema,
): boolean {
  if (!prev) return true;
  const a = jamQueueCatalogIds(prev);
  const b = jamQueueCatalogIds(next);
  return a.length !== b.length || a.some((id, i) => id !== b[i]);
}
