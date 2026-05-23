import type { PlayerStateSchema, QueueStateSchema } from "@ciderjams/proto";
import type { SharePlaySyncInput } from "../../shareplay/types";

import { createLogger } from "@ciderjams/proto";

import {
  applyRepeatModeToMusicKit,
  applyShuffleModeToMusicKit,
  jamQueueCatalogIds,
} from "../musickit/payloads";

const log = createLogger("plugin", "jam/from-server");

const APPLY_SUPPRESS_MS = 750;
const SEEK_DRIFT_MS = 500;

// --- server snapshots → SharePlay (queue rebuild path) ---

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

export function jamQueueCatalogOrderChanged(
  prev: QueueStateSchema | null,
  next: QueueStateSchema,
): boolean {
  if (!prev) return true;
  const a = jamQueueCatalogIds(prev);
  const b = jamQueueCatalogIds(next);
  return a.length !== b.length || a.some((id, i) => id !== b[i]);
}

// --- server player.state → MusicKit (lightweight path) ---

function clampIndex(index: number, queueLength: number): number {
  if (queueLength <= 0) return 0;
  return Math.min(Math.max(0, index), queueLength - 1);
}

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

export type JamInboundSyncOptions = {
  getMusicKit: () => MusicKit.MusicKitInstanceLoose | null;
  getQueue: () => QueueStateSchema | null;
  getPlayer: () => PlayerStateSchema | null;
  isHost: () => boolean;
  /** suppress echo from local MK while applying server snapshots */
  suppressLocalSync: (durationMs?: number) => void;
  applyQueueViaSharePlay: (queue: QueueStateSchema, player: PlayerStateSchema) => Promise<void>;
};

/** Applies latest server queue/player snapshots one at a time. */
export function createJamInboundSync(options: JamInboundSyncOptions) {
  let chain = Promise.resolve();
  let dirty = false;
  let queueRebuildNeeded = false;

  function enqueue() {
    dirty = true;
    chain = chain.then(() => drain());
  }

  async function drain() {
    while (dirty) {
      dirty = false;
      const rebuildQueue = queueRebuildNeeded;
      queueRebuildNeeded = false;

      const music = options.getMusicKit();
      const queue = options.getQueue();
      const player = options.getPlayer();
      if (!music || !Array.isArray(queue) || !player) continue;

      options.suppressLocalSync(APPLY_SUPPRESS_MS);

      try {
        if (rebuildQueue) {
          log.debug("inbound: SharePlay queue apply");
          await options.applyQueueViaSharePlay(queue, player);
        } else {
          log.debug("inbound: playback apply");
          await applyJamPlaybackFromServer(music, queue, player);
        }
      } catch (e) {
        log.warn("inbound jam sync failed", e);
      }
    }
  }

  return {
    reset() {
      chain = Promise.resolve();
      dirty = false;
      queueRebuildNeeded = false;
    },
    onQueueState(next: QueueStateSchema, prev: QueueStateSchema | null) {
      if (jamQueueCatalogOrderChanged(prev, next)) {
        queueRebuildNeeded = true;
      }
      enqueue();
    },
    onPlayerState() {
      enqueue();
    },
  };
}
