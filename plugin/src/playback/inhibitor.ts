import type { ISharePlayGuestAdapter, SharePlayGuestAdapterHooks } from "./adapter";
import type { SharePlaySyncInput } from "./types";

import { createLogger } from "@ciderjams/proto";

import {
  getMusicKitAppDispatcher,
  type MusicKitWithCiderSharePlay,
  subscribeDispatcher,
} from "./bridge";
import { SharePlayServerSync } from "./inhibitor-sync";

export type { SharePlayPublishedMediaState, SharePlaySyncInput } from "./types";

export * from "./adapter";

const log = createLogger("plugin", "playback/inhibitor");

export type SharePlayHooks = SharePlayGuestAdapterHooks;

export class SharePlayInhibitor implements ISharePlayGuestAdapter {
  private originalMethods = new Map<string, { obj: unknown; prop: string; original: unknown }>();
  private music: MusicKitWithCiderSharePlay | null = null;
  private dispatcherCleanups: (() => void)[] = [];
  private currentHooks: SharePlayGuestAdapterHooks;
  private applyingServerSync = false;
  private suppressGuestActionsUntil = 0;
  private syncGeneration = 0;
  private readonly serverSync = new SharePlayServerSync(
    () => ({ hooks: this.hooks, currentHooks: this.currentHooks }),
    (gen) => gen !== this.syncGeneration,
  );

  constructor(private readonly hooks: SharePlayHooks = {}) {
    this.currentHooks = hooks;
  }

  /** @returns false if MusicKit was not available */
  public inject(hooks?: SharePlayGuestAdapterHooks): boolean {
    if (hooks) {
      this.currentHooks = hooks;
    }
    log.debug("injecting");
    const mk = MusicKit.getInstance() as MusicKitWithCiderSharePlay | undefined;
    log.debug("music", mk);
    if (!mk) return false;
    this.music = mk;

    this.music._sharePlay = {
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

    const playActivity = (mk as MusicKit.MusicKitInstance).services?.playActivity as
      | { handleEvent?: (a: string, b: unknown) => unknown }
      | undefined;
    if (playActivity?.handleEvent) {
      const originalHandler = playActivity.handleEvent;
      playActivity.handleEvent = function (eventName: string, data: unknown) {
        try {
          return originalHandler.apply(this, [eventName, data]);
        } catch {
          return;
        }
      };
    }

    this.music.playbackMode = 1; // MIXED_CONTENT
    this.music.autoplayEnabled = false;

    const dispatcher = getMusicKitAppDispatcher(this.music);
    if (dispatcher) {
      this.dispatcherCleanups.push(
        subscribeDispatcher(dispatcher, "sharePlay.nextItem", () => log.debug("nextItem")),
        subscribeDispatcher(dispatcher, "sharePlay.previousItem", () => log.debug("previousItem")),
      );
    }

    const music = this.music;
    const forceSkip = async (original: (...args: unknown[]) => Promise<unknown>) => {
      log.debug("forceSkip");
      const prevMode = music.playbackMode;
      music.playbackMode = 1;
      await original();
      music.playbackMode = prevMode;
    };

    this.patch(this.music, "skipToNextItem", forceSkip);
    this.patch(this.music, "skipToPreviousItem", forceSkip);

    this.currentHooks.onInjected?.() ?? this.hooks.onInjected?.();

    log.debug("injected");
    return true;
  }

  /** Remove all patches and restore original behavior */
  public eject() {
    log.debug("ejecting");
    this.originalMethods.forEach(({ obj, prop, original }, key) => {
      log.debug("restoring original method", key);
      (obj as Record<string, unknown>)[prop] = original;
    });
    this.originalMethods.clear();

    for (const dispose of this.dispatcherCleanups) dispose();
    this.dispatcherCleanups = [];
    this.serverSync.reset();
    this.syncGeneration++;

    const music = this.music;
    if (music) {
      music._sharePlay = undefined;
      music.playbackMode = 1; // MIXED_CONTENT
    }

    this.currentHooks.onEjected?.() ?? this.hooks.onEjected?.();

    log.debug("ejected");
  }

  private patch(
    obj: MusicKitWithCiderSharePlay,
    prop: "skipToNextItem" | "skipToPreviousItem",
    wrapper: (
      original: (...args: unknown[]) => Promise<unknown>,
      ...args: unknown[]
    ) => Promise<unknown>,
  ) {
    const original = (obj as Record<string, unknown>)[prop];
    if (typeof original !== "function") return;
    const key = `${(obj as { constructor?: { name?: string } }).constructor?.name ?? "object"}::${prop}`;
    this.originalMethods.set(key, { obj, prop, original });
    (obj as Record<string, unknown>)[prop] = (...args: unknown[]) =>
      wrapper(original.bind(obj) as (...a: unknown[]) => Promise<unknown>, ...args);
  }

  public async syncFromServer(serverData: SharePlaySyncInput) {
    log.debug("syncFromServer", serverData);
    const music = this.music;
    if (!music) return;

    const gen = ++this.syncGeneration;
    this.applyingServerSync = true;
    this.suppressGuestActionsUntil = Date.now() + 750;
    try {
      await this.serverSync.apply(music, serverData, gen);
    } finally {
      if (gen === this.syncGeneration) {
        this.suppressGuestActionsUntil = Date.now() + 750;
      }
      this.applyingServerSync = false;
    }
  }

  public isSuppressingGuestActions(): boolean {
    return this.applyingServerSync || Date.now() < this.suppressGuestActionsUntil;
  }

  /** Ignore local MusicKit control events while applying server state. */
  public bumpGuestActionSuppress(durationMs = 750): void {
    this.suppressGuestActionsUntil = Math.max(
      this.suppressGuestActionsUntil,
      Date.now() + durationMs,
    );
  }

  public async triggerMockSync() {
    if (!import.meta.env.DEV) {
      log.warn("triggerMockSync is only available in development");
      return;
    }
    log.debug("triggering mock sync");
    const { mockSharePlayData } = await import("./fixtures/mock-sync");
    const parsed = JSON.parse(mockSharePlayData) as SharePlaySyncInput;
    void this.syncFromServer(parsed);
  }
}
