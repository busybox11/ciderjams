/**
 * Replace queue rows without setQueue/replaceQueue (which stops playback).
 */
export function patchMusicKitQueue(
  queue: MusicKit.MutableQueue,
  items: MusicKit.MediaItem[],
  playingIndex: number,
): { didMovePosition: boolean } {
  const previousPosition = queue.position;
  queue.updateItems(items);
  if (playingIndex >= 0 && queue.position !== playingIndex) {
    queue.position = playingIndex;
  }
  return { didMovePosition: queue.position !== previousPosition };
}
