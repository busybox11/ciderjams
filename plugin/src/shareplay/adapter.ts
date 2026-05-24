import type { SharePlaySyncInput } from "@ciderjams/proto";
import type { SharePlayPublishedMediaState } from "./types";

export interface SharePlayHostAdapterHooks {
  onSyncQueue?: () => void;
  onSyncPlayback?: () => void;
}

export interface SharePlayGuestAdapterHooks {
  onInjected?: () => void;
  onEjected?: () => void;
  onMediaStatePublished?: (payload: SharePlayPublishedMediaState) => void;
}

export interface ISharePlayHostAdapter {
  inject(hooks: SharePlayHostAdapterHooks): void;
  eject(): void;
}

export interface ISharePlayGuestAdapter {
  inject(hooks: SharePlayGuestAdapterHooks): boolean;
  eject(): void;
  syncFromServer(serverData: SharePlaySyncInput): Promise<void>;
  triggerMockSync(): void;
}

export interface IPlayerAdapterFactory {
  createHostAdapter(): ISharePlayHostAdapter;
  createGuestAdapter(): ISharePlayGuestAdapter;
}
