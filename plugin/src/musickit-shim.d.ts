// Ensures `MusicKit.MediaItem` is available in type positions.
// Some upstream global typings in this repo define `MusicKit` without `MediaItem`.
declare namespace MusicKit {
  class MediaItem {
    id: string;
    type: string;
    attributes: Record<string, unknown>;
  }
}
