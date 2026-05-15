/** Catalog row we merge into MusicKit before `new MusicKit.MediaItem(...)`. */
export interface SharePlaySyncQueueRow {
  id: string;
  type?: string;
  attributes: Record<string, unknown> & {
    playParams?: Record<string, unknown>;
  };
}

/** Jam server snapshot → `SharePlayInhibitor.syncFromServer`. */
export interface SharePlaySyncInput {
  queue: SharePlaySyncQueueRow[];
  index?: number;
  currentPlayingIndex?: number;
  elapsedTime?: number;
  playbackState?: number;
  /** alternate key used by some payloads */
  state?: number;
  repeatMode?: number;
  shuffleMode?: number;
  autoPlay?: boolean;
  volume?: number;
}

/** What we publish on `sharePlay.mediaStateUpdate` after queue + playback are applied. */
export interface SharePlayPublishedMediaState {
  autoPlay: boolean;
  nowPlayingItemIndex: number;
  queue: MusicKit.MediaItem[];
  playbackState: number;
  repeatMode: number;
  shuffleMode: number;
  playbackElapsedTime: number;
  volume: number;
}
