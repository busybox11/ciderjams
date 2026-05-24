import type { SharePlaySyncInput } from "@ciderjams/proto";
import type { SharePlayPublishedMediaState } from "../types";

import { createLogger } from "@ciderjams/proto";

import { getMusicKitAppDispatcher } from "../../musickit/runtime/dispatcher";

const log = createLogger("plugin", "shareplay/sync/playback-apply");

const PLAYBACK_STATE_PLAYING = 2;
const SEEK_DRIFT_SECONDS = 2;

export async function applySharePlayPlaybackFromServer(
  music: MusicKit.MusicKitInstanceLoose,
  serverData: SharePlaySyncInput,
  ctx: {
    playingIndex: number;
    queueChanged: boolean;
    queueAppliedPosition: boolean;
    instantiatedQueue: MusicKit.MediaItem[];
    isStale: () => boolean;
    onPublish: (payload: SharePlayPublishedMediaState) => void;
  },
): Promise<void> {
  const playbackState = serverData.playbackState ?? serverData.state ?? 0;
  const seekSeconds = (serverData.elapsedTime || 0) / 1000;

  if (music._sharePlay) {
    music._sharePlay.lastKnownElapsedTime = seekSeconds;
  }

  const resyncPlayback = async () => {
    if (ctx.isStale()) return;
    if (music.nowPlayingItemIndex !== ctx.playingIndex) {
      await music.changeToMediaAtIndex(ctx.playingIndex);
      if (ctx.isStale()) return;
    }
    if (serverData.elapsedTime && serverData.elapsedTime > 0) {
      await music.seekToTime(seekSeconds);
      if (ctx.isStale()) return;
    }
  };

  let didApplyPlaybackPosition = ctx.queueAppliedPosition;
  if (!ctx.queueChanged && music.nowPlayingItemIndex !== ctx.playingIndex) {
    if (ctx.isStale()) return;
    await resyncPlayback();
    if (ctx.isStale()) return;
    didApplyPlaybackPosition = true;
  } else if (
    serverData.elapsedTime != null &&
    Math.abs((music.currentPlaybackTime ?? 0) - seekSeconds) > SEEK_DRIFT_SECONDS
  ) {
    if (ctx.isStale()) return;
    await music.seekToTime(seekSeconds);
    if (ctx.isStale()) return;
    didApplyPlaybackPosition = true;
  }

  if (playbackState === PLAYBACK_STATE_PLAYING) {
    try {
      if (ctx.isStale()) return;
      if (!music.isPlaying) await music.play();
      if (ctx.isStale()) return;
      if (didApplyPlaybackPosition && serverData.elapsedTime && serverData.elapsedTime > 0) {
        await music.seekToTime(seekSeconds);
        if (ctx.isStale()) return;
      }
      if (music.nowPlayingItemIndex !== ctx.playingIndex) {
        log.warn("drift after play, re-pinning", ctx.playingIndex);
        await resyncPlayback();
        if (ctx.isStale()) return;
      }
    } catch (e) {
      log.error("error playing", e);
    }
  } else if (!ctx.queueChanged && typeof music.pause === "function") {
    if (ctx.isStale()) return;
    await music.pause();
    if (ctx.isStale()) return;
  }

  const payload: SharePlayPublishedMediaState = {
    autoPlay: serverData.autoPlay ?? true,
    nowPlayingItemIndex: ctx.playingIndex,
    queue: ctx.instantiatedQueue,
    playbackState,
    repeatMode: serverData.repeatMode ?? 0,
    shuffleMode: serverData.shuffleMode ?? 0,
    playbackElapsedTime: seekSeconds,
    volume: serverData.volume ?? 0.1,
  };

  const expectedSongId =
    ctx.instantiatedQueue[ctx.playingIndex]?.id != null
      ? String(ctx.instantiatedQueue[ctx.playingIndex].id)
      : "";

  const refocusIfWrongItem = async (phase: string) => {
    if (ctx.isStale()) return;
    const np = music.nowPlayingItem;
    const got = np?.id != null ? String(np.id) : "";
    if (expectedSongId && got !== expectedSongId) {
      log.warn(`wrong nowPlaying (${phase}), got=${got}, want=${expectedSongId}`);
      await resyncPlayback();
      if (ctx.isStale()) return;
    }
    if (music.nowPlayingItemIndex !== ctx.playingIndex) {
      log.warn("index drift ", phase, music.nowPlayingItemIndex);
      await resyncPlayback();
      if (ctx.isStale()) return;
    }
  };

  if (ctx.isStale()) return;

  log.debug("publishing mediaStateUpdate", payload);
  const dispatcher = getMusicKitAppDispatcher(music);
  dispatcher?.publish("sharePlay.mediaStateUpdate", payload);
  ctx.onPublish(payload);

  await refocusIfWrongItem("post-publish-sync");
  setTimeout(() => {
    if (ctx.isStale()) return;
    void refocusIfWrongItem("post-publish+50ms");
  }, 50);
}
