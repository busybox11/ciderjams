export interface CiderInjectedSharePlay {
  id: string;
  mediaState: {
    capabilities: {
      autoPlayControl: boolean;
      repeatControl: boolean;
      shuffleControl: boolean;
      volumeControl: boolean;
    };
  };
  participants: { id: string; name: string }[];
  checkCapability: () => boolean;
  shouldUpdate: () => boolean;
  lastKnownElapsedTime: number;
}

/** In-place queue mutation (see SharePlayInstance.updateQueue in musickit bundle). */
export type MusicKitMutableQueue = Omit<MusicKit.Queue, "position"> & {
  _queueItems: { item: MusicKit.MediaItem }[];
  updateItems(items: MusicKit.MediaItem[]): void;
  readonly isInitiated: boolean;
  position: number;
};

export type MusicKitWithCiderSharePlay = MusicKit.MusicKitInstanceLoose & {
  _sharePlay?: CiderInjectedSharePlay | undefined;
  /** Cider / Apple Music web use numeric playback mode flags */
  playbackMode: number;
  autoplayEnabled: boolean;
  queue: MusicKitMutableQueue;
};

/**
 * Replace queue rows without setQueue/replaceQueue (which stops playback).
 * Prefer this over internal MKI.updateQueue which is designed for SharePlay voidPlayer usage
*/
export function patchMusicKitQueue(
  queue: MusicKitMutableQueue,
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

/** MusicKit internal dispatcher (subscribe / publish) — guarded at runtime. */
export interface MusicKitAppDispatcher {
  subscribe(event: string, callback: (data: unknown) => void): void;
  unsubscribe(event: string, callback: (data: unknown) => void): void;
  publish(event: string, data: unknown): void;
}

export function getMusicKitAppDispatcher(
  music: MusicKit.MusicKitInstanceLoose,
): MusicKitAppDispatcher | null {
  const raw = music.services?.dispatcher;
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  if (
    typeof d.subscribe !== "function" ||
    typeof d.unsubscribe !== "function" ||
    typeof d.publish !== "function"
  ) {
    return null;
  }
  return raw as MusicKitAppDispatcher;
}

export function subscribeDispatcher(
  dispatcher: MusicKitAppDispatcher,
  event: string,
  handler: (data: unknown) => void,
): () => void {
  dispatcher.subscribe(event, handler);
  return () => dispatcher.unsubscribe(event, handler);
}

/** One handler invocation per event per tick (dispatcher + addEventListener often both fire). */
function coalesceMusicKitHandler(
  handler: (data: unknown) => void,
): (data: unknown) => void {
  let pending = false;
  let lastData: unknown;
  return (data: unknown) => {
    lastData = data;
    if (pending) return;
    pending = true;
    queueMicrotask(() => {
      pending = false;
      handler(lastData);
    });
  };
}

/**
 * Subscribe on both the Cider app dispatcher and MusicKit `addEventListener`.
 * Normal play/pause uses `playbackStateDidChange` on the instance; dispatcher-only
 * names like `playbackPlay` are not always published.
 */
export function subscribeMusicKitEvent(
  music: MusicKit.MusicKitInstanceLoose,
  event: string,
  handler: (data: unknown) => void,
): () => void {
  const coalesced = coalesceMusicKitHandler(handler);
  const cleanups: (() => void)[] = [];

  const dispatcher = getMusicKitAppDispatcher(music);
  if (dispatcher) {
    cleanups.push(subscribeDispatcher(dispatcher, event, coalesced));
  }

  music.addEventListener(event, coalesced);
  cleanups.push(() => {
    const mk = music as MusicKit.MusicKitInstanceLoose & {
      removeEventListener?: (name: string, callback: Function) => void;
    };
    mk.removeEventListener?.(event, coalesced);
  });

  return () => {
    for (const dispose of cleanups) dispose();
  };
}
