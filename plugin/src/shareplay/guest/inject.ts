import { createLogger } from "@ciderjams/proto";

import { getMusicKitAppDispatcher, subscribeDispatcher } from "../../musickit/runtime/dispatcher";

const log = createLogger("plugin", "shareplay/guest/inject");

type PatchedSkipMethod = "skipToNextItem" | "skipToPreviousItem";

export class MusicKitSharePlayInject {
  private originalMethods = new Map<string, { obj: unknown; prop: string; original: unknown }>();
  private dispatcherCleanups: (() => void)[] = [];

  install(music: MusicKit.MusicKitInstanceLoose): void {
    music._sharePlay = {
      id: "cider-jams-session",
      mediaState: {
        capabilities: {
          autoPlayControl: true,
          repeatControl: true,
          shuffleControl: true,
          volumeControl: true,
        },
      },
      participants: [
        { id: "1", name: "rain capsule" },
        { id: "2", name: "breyy" },
        { id: "3", name: "Hortense" },
      ],
      checkCapability: () => true,
      shouldUpdate: () => true,
      lastKnownElapsedTime: 0,
    };

    wrapPlayActivityHandler(music);
    music.playbackMode = 1; // MIXED_CONTENT
    music.autoplayEnabled = false;

    const dispatcher = getMusicKitAppDispatcher(music);
    if (dispatcher) {
      this.dispatcherCleanups.push(
        subscribeDispatcher(dispatcher, "sharePlay.nextItem", () => log.debug("nextItem")),
        subscribeDispatcher(dispatcher, "sharePlay.previousItem", () => log.debug("previousItem")),
      );
    }

    const forceSkip = async (original: (...args: unknown[]) => Promise<unknown>) => {
      log.debug("forceSkip");
      const prevMode = music.playbackMode;
      music.playbackMode = 1;
      await original();
      music.playbackMode = prevMode;
    };

    this.patch(music, "skipToNextItem", forceSkip);
    this.patch(music, "skipToPreviousItem", forceSkip);
  }

  eject(music: MusicKit.MusicKitInstanceLoose | null): void {
    this.originalMethods.forEach(({ obj, prop, original }, key) => {
      log.debug("restoring original method", key);
      const patchable = obj as MusicKit.MusicKitInstanceLoose;
      if (prop === "skipToNextItem")
        patchable.skipToNextItem = original as typeof patchable.skipToNextItem;
      else patchable.skipToPreviousItem = original as typeof patchable.skipToPreviousItem;
    });
    this.originalMethods.clear();

    for (const dispose of this.dispatcherCleanups) dispose();
    this.dispatcherCleanups = [];

    if (music) {
      music._sharePlay = undefined;
      music.playbackMode = 1; // MIXED_CONTENT
    }
  }

  private patch(
    obj: MusicKit.MusicKitInstanceLoose,
    prop: PatchedSkipMethod,
    wrapper: (
      original: (...args: unknown[]) => Promise<unknown>,
      ...args: unknown[]
    ) => Promise<unknown>,
  ) {
    const original = obj[prop];
    if (typeof original !== "function") return;
    const key = `${obj.constructor?.name ?? "object"}::${prop}`;
    this.originalMethods.set(key, { obj, prop, original });
    const patched = (...args: unknown[]) =>
      wrapper(original.bind(obj) as (...a: unknown[]) => Promise<unknown>, ...args);
    if (prop === "skipToNextItem") obj.skipToNextItem = patched;
    else obj.skipToPreviousItem = patched;
  }
}

function wrapPlayActivityHandler(music: MusicKit.MusicKitInstanceLoose): void {
  const playActivity = music.services?.playActivity;
  if (!playActivity?.handleEvent) return;

  const originalHandler = playActivity.handleEvent;
  playActivity.handleEvent = function (eventName: string, data: unknown) {
    try {
      return originalHandler.apply(this, [eventName, data]);
    } catch {
      return;
    }
  };
}
