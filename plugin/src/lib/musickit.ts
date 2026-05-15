import {
  queueSetPayload,
  roomCreatePayload,
  type PlayerStateSchema,
  type QueueSetPayload,
  type RoomCreatePayload,
} from "@ciderjams/proto";

import { createLogger } from "@ciderjams/proto";

const log = createLogger("plugin", "lib/musickit");

function mapPlaybackState(
  state: MusicKit.PlaybackStates,
): PlayerStateSchema["playbackState"] {
  switch (state) {
    case MusicKit.PlaybackStates.playing:
    case MusicKit.PlaybackStates.paused:
    case MusicKit.PlaybackStates.seeking:
    case MusicKit.PlaybackStates.waiting:
    case MusicKit.PlaybackStates.loading:
      return "FULL_PLAYBACK_ONLY";
    default:
      return "PREVIEW_ONLY";
  }
}

export function mapRepeatMode(
  mode: MusicKit.PlayerRepeatMode,
): PlayerStateSchema["repeatMode"] {
  const modes: PlayerStateSchema["repeatMode"][] = [
    "REPEAT_OFF",
    "REPEAT_ALL",
    "REPEAT_ONE",
  ];
  return modes[mode] ?? "REPEAT_OFF";
}

export function mapShuffleMode(
  mode: MusicKit.PlayerShuffleMode,
): PlayerStateSchema["shuffleMode"] {
  return mode === 1 ? "SHUFFLE_ON" : "SHUFFLE_OFF";
}

export function playbackPositionMs(
  music: MusicKit.MusicKitInstanceLoose,
): number {
  const sec = music.currentPlaybackTime ?? 0;
  return Math.max(0, Math.round(sec * 1000));
}

export function createQueuePayload<T extends boolean = false>(
  music: MusicKit.MusicKitInstanceLoose,
  jamQueue?: QueueSetPayload | null,
  isRoomCreate?: T,
): T extends true
  ? RoomCreatePayload["playbackState"]["queue"]
  : QueueSetPayload {
  const queueItems = music.queue._queueItems.map((item) => {
    const jamItem = jamQueue?.find((e) => e.itemCatalogId === item.item.id);

    return {
      itemCatalogId: item.item.id,
      ...(jamItem && {
        queueEntryId: jamItem.queueEntryId,
        ownerUserId: jamItem.ownerUserId,
      }),
    };
  });

  log.debug("queue items", queueItems);

  const schema = isRoomCreate
    ? roomCreatePayload.shape.playbackState.shape.queue
    : queueSetPayload;

  const result = schema.safeParse(queueItems);

  if (!result.success) {
    throw new Error(
      "Failed to create queue state payload: " + result.error.message,
    );
  }

  return result.data as T extends true
    ? RoomCreatePayload["playbackState"]["queue"]
    : QueueSetPayload;
}

export function createRoomCreatePlaybackStatePayload(
  music: MusicKit.MusicKitInstanceLoose,
): RoomCreatePayload["playbackState"] {
  const queue = createQueuePayload(music, undefined, true);

  const result = roomCreatePayload.shape.playbackState.safeParse({
    queue,
    currentPlayingIndex: music.nowPlayingItemIndex ?? 0,
    elapsedTimeMs: playbackPositionMs(music),
    playbackState: mapPlaybackState(music.playbackState),
    repeatMode: mapRepeatMode(music.repeatMode ?? 0),
    shuffleMode: mapShuffleMode(music.shuffleMode ?? 0),
    autoPlay: music.autoplayEnabled,
  });

  log.debug("room create playback state payload", result.data);

  if (!result.success) {
    throw new Error(
      "Failed to create room create playback state payload: " +
        result.error.message,
    );
  }

  return {
    ...result.data,
    queue,
  };
}
