import type {
  PlayerHostSyncPayload,
  QueueSetPayload,
  RoomCreatePayload,
  QueueStateSchema,
} from "@ciderjams/proto";

/** Builds proto-valid playback/queue payloads for host ↔ server sync (MusicKit or debug). */
export interface JamHostPlayerAdapter {
  getRoomCreatePlaybackState(): RoomCreatePayload["playbackState"];

  getQueueSetPayload(jamQueue: QueueStateSchema | null): QueueSetPayload;

  getHostSyncPlaybackState(): PlayerHostSyncPayload["playbackState"];
}
