import {
  parsePayload,
  PlayerHostSyncPayload,
  playerHostSyncPayload,
  queueSetPayload,
  roomCreatePayload,
  type PlayerStateSchema,
  type QueueSetPayload,
  type RoomCreatePayload,
  type SchemaInput,
} from "@ciderjams/proto";

import { createLogger } from "@ciderjams/proto";

const log = createLogger("plugin", "lib/musickit/payloads");

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

export function getItemCatalogId(item: MusicKit.MediaItem): string {
  // prefer the global catalogId if it exists, to prevent user library specific items
  // TODO: maybe use zod validator to prevent non-global catalogId items id shapes?
  // ex. AMItemCatalogId = z.string().regex(/^[0-9]+$/);
  //     AMItemLibraryId = z.string().regex(/^i\.[A-Za-z0-9]+$/); (maybe)

  log.debug("item", item);
  return item.attributes?.playParams?.catalogId ?? item.id;
}

const roomCreateQueueSchema = roomCreatePayload.shape.playbackState.shape.queue;
export function makeQueuePayload(
  music: MusicKit.MusicKitInstanceLoose,
  jamQueue: null | undefined,
  isRoomCreate: true,
): RoomCreatePayload["playbackState"]["queue"];
export function makeQueuePayload(
  music: MusicKit.MusicKitInstanceLoose,
  jamQueue?: QueueSetPayload | null,
  isRoomCreate?: false,
): QueueSetPayload;
export function makeQueuePayload(
  music: MusicKit.MusicKitInstanceLoose,
  jamQueue?: QueueSetPayload | null,
  isRoomCreate?: boolean,
): RoomCreatePayload["playbackState"]["queue"] | QueueSetPayload {
  if (isRoomCreate) {
    const queueItems = music.queue._queueItems.map((item) => ({
      itemCatalogId: item.item.id,
    })) satisfies SchemaInput<typeof roomCreateQueueSchema>;

    log.debug("queue items", queueItems);

    return parsePayload(
      roomCreateQueueSchema,
      queueItems,
      "Failed to create queue state payload",
    );
  }

  const queueItems = music.queue._queueItems.map((item) => {
    const itemCatalogId = getItemCatalogId(item.item);

    const jamItem = jamQueue?.find((e) => e.itemCatalogId === itemCatalogId);

    return {
      itemCatalogId,
      ...(jamItem && {
        queueEntryId: jamItem.queueEntryId,
        ownerUserId: jamItem.ownerUserId,
      }),
    };
  }) satisfies SchemaInput<typeof queueSetPayload>;

  log.debug("queue items", queueItems);

  return parsePayload(
    queueSetPayload,
    queueItems,
    "Failed to create queue state payload",
  );
}

const roomSyncPlaybackStateSchema = playerHostSyncPayload.shape.playbackState;
export function makePlayerHostSyncPayload(
  music: MusicKit.MusicKitInstanceLoose,
): PlayerHostSyncPayload["playbackState"] {
  const payload = {
    currentPlayingIndex: music.nowPlayingItemIndex ?? 0,
    playbackState: mapPlaybackState(music.playbackState),
    repeatMode: mapRepeatMode(music.repeatMode ?? 0),
    shuffleMode: mapShuffleMode(music.shuffleMode ?? 0),
    elapsedTimeMs: playbackPositionMs(music),
    isPlaying: music.isPlaying,
    autoPlay: music.autoplayEnabled,
  } satisfies SchemaInput<typeof roomSyncPlaybackStateSchema>;

  log.debug("player host sync payload", payload);

  return parsePayload(
    roomSyncPlaybackStateSchema,
    payload,
    "Failed to create player host sync payload",
  );
}

const roomCreatePlaybackStateSchema = roomCreatePayload.shape.playbackState;
export function makeRoomPlaybackStatePayload(
  music: MusicKit.MusicKitInstanceLoose,
): RoomCreatePayload["playbackState"] {
  const baseState = makePlayerHostSyncPayload(music);
  const queue = makeQueuePayload(music, undefined, true);

  const playbackState = {
    ...baseState,
    queue,
  } satisfies SchemaInput<typeof roomCreatePlaybackStateSchema>;

  log.debug("room create playback state payload", playbackState);

  const parsed = parsePayload(
    roomCreatePlaybackStateSchema,
    playbackState,
    "Failed to create room create playback state payload",
  );

  return {
    ...parsed,
    queue,
  };
}
