import type { ISharePlayGuestAdapter, SharePlayGuestAdapterHooks } from "./adapter";
import type { SharePlaySyncInput } from "./types";

import { createLogger } from "@ciderjams/proto";

import type { MusicKitWithCiderSharePlay } from "./bridge";
import { MusicKitSharePlayInject } from "./inhibitor-inject";
import { SharePlayServerSync } from "./inhibitor-sync";

export type { SharePlayPublishedMediaState, SharePlaySyncInput } from "./types";

export * from "./adapter";

const log = createLogger("plugin", "playback/inhibitor");

export type SharePlayHooks = SharePlayGuestAdapterHooks;

export class SharePlayInhibitor implements ISharePlayGuestAdapter {
  private music: MusicKitWithCiderSharePlay | null = null;
  private currentHooks: SharePlayGuestAdapterHooks;
  private applyingServerSync = false;
  private suppressGuestActionsUntil = 0;
  private syncGeneration = 0;
  private readonly mkInject = new MusicKitSharePlayInject();
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
    this.mkInject.install(mk);

    this.currentHooks.onInjected?.() ?? this.hooks.onInjected?.();

    log.debug("injected");
    return true;
  }

  /** Remove all patches and restore original behavior */
  public eject() {
    log.debug("ejecting");
    this.mkInject.eject(this.music);
    this.serverSync.reset();
    this.syncGeneration++;

    this.currentHooks.onEjected?.() ?? this.hooks.onEjected?.();

    log.debug("ejected");
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
