import {
  queueStateSchema,
  roomCreatePayload,
  type PlayerStateSchema,
  type QueueStateSchema,
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

function mapRepeatMode(
  mode: MusicKit.PlayerRepeatMode,
): PlayerStateSchema["repeatMode"] {
  const modes: PlayerStateSchema["repeatMode"][] = [
    "REPEAT_OFF",
    "REPEAT_ALL",
    "REPEAT_ONE",
  ];
  return modes[mode] ?? "REPEAT_OFF";
}

function mapShuffleMode(
  mode: MusicKit.PlayerShuffleMode,
): PlayerStateSchema["shuffleMode"] {
  return mode === 1 ? "SHUFFLE_ON" : "SHUFFLE_OFF";
}

export function createQueueStatePayload<T extends boolean = false>(
  music: MusicKit.MusicKitInstanceLoose,
  jamQueue?: QueueStateSchema,
  isRoomCreate?: T,
): T extends true
  ? RoomCreatePayload["playbackState"]["queue"]
  : QueueStateSchema {
  const queueItems = music.queue._queueItems.map((item) => {
    const jamItem = jamQueue?.find((e) => e.itemCatalogId === item.item.id);
    if (isRoomCreate) {
      return {
        itemCatalogId: item.item.id,
        ...(jamItem && {
          queueEntryId: jamItem.queueEntryId,
          ownerUserId: jamItem.ownerUserId,
        }),
      };
    }
    return { itemCatalogId: item.item.id };
  });

  log.debug("queue items", queueItems);

  const schema = isRoomCreate
    ? roomCreatePayload.shape.playbackState.shape.queue
    : queueStateSchema;

  const result = schema.safeParse(queueItems);

  if (!result.success) {
    throw new Error(
      "Failed to create queue state payload: " + result.error.message,
    );
  }

  return result.data as T extends true
    ? RoomCreatePayload["playbackState"]["queue"]
    : QueueStateSchema;
}

export function createRoomCreatePlaybackStatePayload(
  music: MusicKit.MusicKitInstanceLoose,
): RoomCreatePayload["playbackState"] {
  const player = music.player;

  const queue = createQueueStatePayload(music, undefined, true);

  const result = roomCreatePayload.shape.playbackState.safeParse({
    queue,
    currentPlayingIndex: player?.nowPlayingItemIndex ?? 0,
    elapsedTimeMs: (player?.currentPlaybackProgress ?? 0) * 1000,
    playbackState: mapPlaybackState(music.playbackState),
    repeatMode: mapRepeatMode(player?.repeatMode ?? 0),
    shuffleMode: mapShuffleMode(player?.shuffleMode ?? 0),
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
