import type { SharePlaySyncInput } from "@ciderjams/proto";
import type { ISharePlayGuestAdapter, SharePlayGuestAdapterHooks } from "../adapter";

import { createLogger, sharePlaySyncInputSchema } from "@ciderjams/proto";

import { MusicKitSharePlayInject } from "./inject";
import { SharePlayServerSync } from "./sync";

export type { SharePlaySyncInput } from "@ciderjams/proto";
export type { SharePlayPublishedMediaState } from "../types";

export * from "../adapter";

const log = createLogger("plugin", "shareplay/guest/inhibitor");

export type SharePlayHooks = SharePlayGuestAdapterHooks;

export class SharePlayInhibitor implements ISharePlayGuestAdapter {
  private music: MusicKit.MusicKitInstanceLoose | null = null;
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

  public inject(hooks?: SharePlayGuestAdapterHooks): boolean {
    if (hooks) {
      this.currentHooks = hooks;
    }
    log.debug("injecting");
    const mk = MusicKit.getInstance();
    log.debug("music", mk);
    if (!mk) return false;

    this.music = mk;
    this.mkInject.install(mk);

    this.currentHooks.onInjected?.() ?? this.hooks.onInjected?.();

    log.debug("injected");
    return true;
  }

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
    const { mockSharePlayData } = await import("../fixtures/mock-sync");
    const parsed = sharePlaySyncInputSchema.parse(JSON.parse(mockSharePlayData));
    void this.syncFromServer(parsed);
  }
}
