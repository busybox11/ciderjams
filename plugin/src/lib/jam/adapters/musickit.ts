import type { QueueStateSchema } from "@ciderjams/proto";
import type { SharePlayHostAdapterHooks } from "../../../shareplay/adapter";
import type { JamHostPlayerAdapter } from "../player-adapter";
import type { JamHostSyncSource } from "../session";

import { SharePlayHost } from "../../../shareplay/host";
import {
  makePlayerHostSyncPayload,
  makeQueuePayload,
  makeRoomPlaybackStatePayload,
} from "../../musickit/payloads";

export class MusicKitJamHostPlayerAdapter implements JamHostPlayerAdapter {
  constructor(private readonly music: MusicKit.MusicKitInstanceLoose) {}

  getRoomCreatePlaybackState() {
    return makeRoomPlaybackStatePayload(this.music);
  }

  getQueueSetPayload(jamQueue: QueueStateSchema | null) {
    return makeQueuePayload(this.music, jamQueue);
  }

  getHostSyncPlaybackState() {
    return makePlayerHostSyncPayload(this.music);
  }
}

export class MusicKitJamHostSyncSource implements JamHostSyncSource {
  private readonly host: SharePlayHost;

  constructor(music: MusicKit.MusicKitInstanceLoose) {
    this.host = new SharePlayHost(music);
  }

  start(hooks: SharePlayHostAdapterHooks): void {
    this.host.inject(hooks);
  }

  stop(): void {
    this.host.eject();
  }

  suppressOutgoingPlaybackSync(durationMs?: number): void {
    this.host.suppressOutgoingPlaybackSync(durationMs);
  }
}
