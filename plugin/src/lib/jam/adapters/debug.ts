import type { JamHostPlayerAdapter } from "../player-adapter";

import {
  type PlayerHostSyncPayload,
  type PlayerRepeatMode,
  type PlayerShuffleMode,
  type PlayerStateSchema,
  parsePayload,
  type playbackState,
  playerHostSyncPayload,
  type QueueSetPayload,
  type QueueStateSchema,
  queueSetPayload,
  type RoomCreatePayload,
  roomCreatePayload,
} from "@ciderjams/proto";

const roomCreatePlaybackSchema = roomCreatePayload.shape.playbackState;
const roomSyncPlaybackSchema = playerHostSyncPayload.shape.playbackState;

export class DebugJamHostPlayerAdapter implements JamHostPlayerAdapter {
  /** Local queue order; server assigns queueEntryId / ownerUserId after sync. */
  private catalogIds: string[] = [];

  currentPlayingIndex = 0;
  isPlaying = false;
  elapsedTimeMs = 0;
  repeatMode: PlayerRepeatMode = "REPEAT_OFF";
  shuffleMode: PlayerShuffleMode = "SHUFFLE_OFF";
  autoPlay = false;

  getQueueSnapshot(): string[] {
    return [...this.catalogIds];
  }

  addTrack(catalogId: string): void {
    const id = catalogId.trim();
    if (!id) return;
    this.catalogIds.push(id);
    if (this.catalogIds.length === 1) {
      this.currentPlayingIndex = 0;
    }
  }

  clearQueue(): void {
    this.catalogIds = [];
    this.currentPlayingIndex = 0;
    this.isPlaying = false;
    this.elapsedTimeMs = 0;
  }

  play(): void {
    if (this.catalogIds.length === 0) return;
    this.isPlaying = true;
  }

  pause(): void {
    this.isPlaying = false;
  }

  seek(positionMs: number): void {
    this.elapsedTimeMs = Math.max(0, Math.round(positionMs));
  }

  advanceElapsedMs(deltaMs: number): void {
    if (!this.isPlaying || this.catalogIds.length === 0) return;
    this.elapsedTimeMs = Math.max(0, this.elapsedTimeMs + Math.round(deltaMs));
  }

  applyServerPlayerState(p: PlayerStateSchema): void {
    if (this.catalogIds.length === 0) return;
    const last = this.catalogIds.length - 1;
    this.currentPlayingIndex = Math.min(Math.max(0, p.currentPlayingIndex), last);
    this.elapsedTimeMs = Math.max(0, p.elapsedTimeMs);
    this.isPlaying = p.isPlaying;
    this.repeatMode = p.repeatMode;
    this.shuffleMode = p.shuffleMode;
    this.autoPlay = p.autoPlay;
  }

  private playbackEnum(): playbackState {
    return this.catalogIds.length === 0 ? "PREVIEW_ONLY" : "FULL_PLAYBACK_ONLY";
  }

  private clampIndex(): number {
    if (this.catalogIds.length === 0) return 0;
    return Math.min(Math.max(0, this.currentPlayingIndex), this.catalogIds.length - 1);
  }

  private baseRoomPlayback(): RoomCreatePayload["playbackState"] {
    const queue = this.catalogIds.map((itemCatalogId) => ({ itemCatalogId }));
    const idx = this.clampIndex();
    return {
      queue,
      currentPlayingIndex: idx,
      isPlaying: this.isPlaying,
      elapsedTimeMs: this.elapsedTimeMs,
      playbackState: this.playbackEnum(),
      repeatMode: this.repeatMode,
      shuffleMode: this.shuffleMode,
      autoPlay: this.autoPlay,
    };
  }

  getRoomCreatePlaybackState(): RoomCreatePayload["playbackState"] {
    return parsePayload(
      roomCreatePlaybackSchema,
      this.baseRoomPlayback(),
      "debug room.create playbackState",
    );
  }

  getQueueSetPayload(jamQueue: QueueStateSchema | null): QueueSetPayload {
    const jam = jamQueue ?? [];
    const items = this.catalogIds.map((itemCatalogId) => {
      const jamItem = jam.find((e) => e.itemCatalogId === itemCatalogId);
      return {
        itemCatalogId,
        ...(jamItem && {
          queueEntryId: jamItem.queueEntryId,
          ownerUserId: jamItem.ownerUserId,
        }),
      };
    });
    return parsePayload(queueSetPayload, items, "debug queue.set payload");
  }

  getHostSyncPlaybackState(): PlayerHostSyncPayload["playbackState"] {
    const payload = {
      currentPlayingIndex: this.clampIndex(),
      playbackState: this.playbackEnum(),
      repeatMode: this.repeatMode,
      shuffleMode: this.shuffleMode,
      elapsedTimeMs: this.elapsedTimeMs,
      isPlaying: this.isPlaying,
      autoPlay: this.autoPlay,
    };
    return parsePayload(roomSyncPlaybackSchema, payload, "debug player.host.sync playbackState");
  }
}
