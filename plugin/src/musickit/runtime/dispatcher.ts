function isMusicKitAppDispatcher(raw: unknown): raw is MusicKit.MusicKitAppDispatcher {
  if (!raw || typeof raw !== "object") return false;
  const d = raw as Record<string, unknown>;
  return (
    typeof d.subscribe === "function" &&
    typeof d.unsubscribe === "function" &&
    typeof d.publish === "function"
  );
}

export function getMusicKitAppDispatcher(
  music: MusicKit.MusicKitInstanceLoose,
): MusicKit.MusicKitAppDispatcher | null {
  const raw = music.services?.dispatcher;
  return isMusicKitAppDispatcher(raw) ? raw : null;
}

export function subscribeDispatcher(
  dispatcher: MusicKit.MusicKitAppDispatcher,
  event: string,
  handler: (data: unknown) => void,
): () => void {
  dispatcher.subscribe(event, handler);
  return () => dispatcher.unsubscribe(event, handler);
}
