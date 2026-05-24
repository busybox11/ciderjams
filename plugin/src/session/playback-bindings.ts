import type { PlayerStateSchema, QueueStateSchema } from "@ciderjams/proto";
import type { JamHostSessionHandle } from "./host/session";

import { jamPlaybackToSharePlayPayload } from "@ciderjams/proto";

import { useSharePlayStore } from "../playback/store";
import { createJamInboundSync } from "./sync/inbound";

export function createJamStoreInboundSync(deps: {
  getMusicKit: () => MusicKit.MusicKitInstanceLoose | null;
  getQueue: () => QueueStateSchema | null;
  getPlayer: () => PlayerStateSchema | null;
  isHost: () => boolean;
  getJamHostSession: () => JamHostSessionHandle | null;
}) {
  return createJamInboundSync({
    getMusicKit: deps.getMusicKit,
    getQueue: deps.getQueue,
    getPlayer: deps.getPlayer,
    isHost: deps.isHost,
    suppressLocalSync(ms) {
      const share = useSharePlayStore();
      share.bumpGuestActionSuppress(ms);
      if (deps.isHost()) deps.getJamHostSession()?.suppressHostPlaybackSync(ms);
    },
    applyQueueViaSharePlay(queue, player) {
      const share = useSharePlayStore();
      if (!share.inhibitor) return Promise.resolve();
      return (
        share.syncFromServer(jamPlaybackToSharePlayPayload(queue, player)) ?? Promise.resolve()
      );
    },
  });
}
