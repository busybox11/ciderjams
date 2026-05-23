import type { ISharePlayGuestAdapter, SharePlayGuestAdapterHooks } from "@shareplay/adapter";
import type { SharePlaySyncInput } from "@shareplay/types";

import { createLogger } from "@ciderjams/proto";

const log = createLogger("debug", "mock-guest-adapter");

export class MockGuestAdapter implements ISharePlayGuestAdapter {
  private hooks?: SharePlayGuestAdapterHooks;

  inject(hooks: SharePlayGuestAdapterHooks): boolean {
    this.hooks = hooks;
    log.debug("[MockGuest] Injected");
    setTimeout(() => {
      this.hooks?.onInjected?.();
    }, 10);
    return true;
  }

  eject(): void {
    log.debug("[MockGuest] Ejected");
    this.hooks?.onEjected?.();
  }

  async syncFromServer(serverData: SharePlaySyncInput): Promise<void> {
    log.debug("[MockGuest] Received Sync From Server:", serverData);

    this.hooks?.onMediaStatePublished?.({
      autoPlay: serverData.autoPlay ?? true,
      nowPlayingItemIndex: serverData.index ?? serverData.currentPlayingIndex ?? 0,
      queue: (serverData.queue as never[]) || [],
      playbackState: serverData.playbackState ?? serverData.state ?? 0,
      repeatMode: serverData.repeatMode ?? 0,
      shuffleMode: serverData.shuffleMode ?? 0,
      playbackElapsedTime: (serverData.elapsedTime || 0) / 1000,
      volume: serverData.volume ?? 1,
    });
  }

  triggerMockSync(): void {
    log.debug("[MockGuest] Trigger Mock Sync");
  }
}
