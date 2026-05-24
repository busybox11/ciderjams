/** published on `sharePlay.mediaStateUpdate` after queue + playback are applied */
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
