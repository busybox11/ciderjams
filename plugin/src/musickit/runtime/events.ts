import { getMusicKitAppDispatcher, subscribeDispatcher } from "./dispatcher";

function coalesceMusicKitHandler(handler: (data: unknown) => void): (data: unknown) => void {
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

/** subscribe on Cider dispatcher and MusicKit `addEventListener` (coalesced per tick) */
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
  if (music.removeEventListener) {
    cleanups.push(() => music.removeEventListener?.(event, coalesced));
  }

  return () => {
    for (const dispose of cleanups) dispose();
  };
}
