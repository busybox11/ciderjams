import {
  playerStateSchema,
  queueStateSchema,
  roomMeta as roomMetaSchema,
  roomStateSchema,
  type BasePlaybackState,
  type PlayerRepeatMode,
  type PlayerShuffleMode,
  type PlayerStateSchema,
  type queueEntry,
  type QueueSetPayload,
  type QueueStateSchema,
  type RoomCreatePayload,
  type roomMeta,
  type roomParticipant,
  type RoomStateSchema,
} from "@ciderjams/proto";
import { randomBytes } from "node:crypto";

function nowMs(): number {
  return Date.now();
}

function newQueueEntryId(): string {
  return randomBytes(12).toString("hex");
}

export class Room {
  #meta: roomMeta;
  readonly participants = new Map<string, roomParticipant>();

  private constructor(meta: roomMeta) {
    this.#meta = roomMetaSchema.parse(meta);
  }

  static create(
    host: roomParticipant,
    roomId: string,
    roomCode: string,
    playbackState: RoomCreatePayload["playbackState"],
  ): Room {
    const meta = roomMetaSchema.parse({
      roomId,
      roomCode,
      hostUserId: host.userId,
      participants: [host],
      playbackState: {
        ...playbackState,
        queue: playbackState.queue.map((item) => ({
          itemCatalogId: item.itemCatalogId,
          queueEntryId: newQueueEntryId(),
          ownerUserId: host.userId,
        })),
        updatedAtMs: nowMs(),
      },
    });

    const room = new Room(meta);
    room.participants.set(host.userId, host);

    return room;
  }

  get meta(): Readonly<roomMeta> {
    return this.#meta;
  }

  get isEmpty(): boolean {
    return this.participants.size === 0;
  }

  assertParticipant(userId: string): void {
    if (!this.participants.has(userId)) {
      throw new Error("not a member of this room");
    }
  }

  roomStatePayload(): RoomStateSchema {
    const { playbackState: _s, ...rest } = this.#meta;
    return roomStateSchema.parse(rest);
  }

  queueStatePayload(): QueueStateSchema {
    return queueStateSchema.parse(this.#meta.playbackState.queue);
  }

  playerStatePayload(): PlayerStateSchema {
    const { queue: _q, ...rest } = this.#meta.playbackState;
    return playerStateSchema.parse(rest);
  }

  #commit(next: roomMeta): void {
    this.#meta = roomMetaSchema.parse(next);
  }

  #patchState(patch: Partial<BasePlaybackState>): void {
    this.#commit({
      ...this.#meta,
      playbackState: {
        ...this.#meta.playbackState,
        ...patch,
        updatedAtMs: nowMs(),
      },
    });
  }

  join(user: roomParticipant): void {
    this.participants.set(user.userId, user);
    this.#syncParticipantsIntoMeta();
  }

  /** @returns true if the room has no participants left (caller may remove from registry) */
  leave(userId: string): boolean {
    this.participants.delete(userId);
    if (this.participants.size > 0) this.#syncParticipantsIntoMeta();
    return this.participants.size === 0;
  }

  #syncParticipantsIntoMeta(): void {
    this.#commit({
      ...this.#meta,
      participants: [...this.participants.values()],
    });
  }

  setQueue(actingUserId: string, entries: QueueSetPayload): void {
    this.assertParticipant(actingUserId);

    const queue: queueEntry[] = entries.map((e) => ({
      queueEntryId: e.queueEntryId ?? newQueueEntryId(),
      ownerUserId: e.ownerUserId ?? actingUserId,
      itemCatalogId: e.itemCatalogId,
    }));

    let { currentPlayingIndex } = this.#meta.playbackState;
    if (queue.length === 0) {
      currentPlayingIndex = 0;
    } else if (currentPlayingIndex >= queue.length) {
      currentPlayingIndex = queue.length - 1;
    }

    this.#patchState({ queue, currentPlayingIndex });
  }

  play(userId: string): void {
    this.assertParticipant(userId);
    this.#patchState({ playbackState: "FULL_PLAYBACK_ONLY" });
  }

  pause(userId: string): void {
    this.assertParticipant(userId);
    this.#patchState({});
  }

  seek(userId: string, positionMs: number): void {
    this.assertParticipant(userId);
    this.#patchState({ elapsedTimeMs: positionMs });
  }

  next(userId: string): void {
    this.assertParticipant(userId);

    const { queue, currentPlayingIndex, repeatMode } = this.#meta.playbackState;

    if (queue.length === 0) return;

    const last = queue.length - 1;
    let nextIndex = currentPlayingIndex + 1;
    if (nextIndex > last) {
      if (repeatMode === "REPEAT_ALL") nextIndex = 0;
      else if (repeatMode === "REPEAT_ONE") nextIndex = currentPlayingIndex;
      else nextIndex = last;
    }

    this.#patchState({ currentPlayingIndex: nextIndex, elapsedTimeMs: 0 });
  }

  previous(userId: string): void {
    this.assertParticipant(userId);

    const { queue, currentPlayingIndex, repeatMode } = this.#meta.playbackState;

    if (queue.length === 0) return;

    let prevIndex = currentPlayingIndex - 1;
    if (prevIndex < 0) {
      if (repeatMode === "REPEAT_ALL") prevIndex = queue.length - 1;
      else prevIndex = 0;
    }

    this.#patchState({ currentPlayingIndex: prevIndex, elapsedTimeMs: 0 });
  }

  setRepeat(userId: string, mode: PlayerRepeatMode): void {
    this.assertParticipant(userId);
    this.#patchState({ repeatMode: mode });
  }

  setShuffle(userId: string, mode: PlayerShuffleMode): void {
    this.assertParticipant(userId);
    this.#patchState({ shuffleMode: mode });
  }
}
