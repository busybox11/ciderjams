import type { SharePlayHostAdapterHooks } from "../../shareplay/adapter";
import type { JamHostSyncSource } from "./session";

/** Host pushes queue/playback only when `trigger*` is called (debug UI). */
export class ManualJamHostSyncSource implements JamHostSyncSource {
  private hooks: SharePlayHostAdapterHooks = {};

  start(hooks: SharePlayHostAdapterHooks): void {
    this.hooks = hooks;
  }

  stop(): void {
    this.hooks = {};
  }

  triggerQueueSync(): void {
    this.hooks.onSyncQueue?.();
  }

  triggerPlaybackSync(): void {
    this.hooks.onSyncPlayback?.();
  }
}
