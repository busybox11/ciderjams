import { createLogger } from "@ciderjams/proto";
import { mockSharePlayData } from "./mock";

const log = createLogger("plugin", "shareplay");

export interface SharePlayParticipant {
  id: string;
  name: string;
}

export interface SharePlayHooks {
  onInjected?: (participants: SharePlayParticipant[]) => void;
  onEjected?: () => void;
  onMediaStatePublished?: (payload: unknown) => void;
}

type MusicKitInstance = MusicKit.MusicKitInstance & {
  _sharePlay?: {
    id: string;
    mediaState: {
      capabilities: {
        autoPlayControl: boolean;
        repeatControl: boolean;
        shuffleControl: boolean;
        volumeControl: boolean;
      };
    };
    participants: SharePlayParticipant[];
    checkCapability: () => boolean;
    shouldUpdate: () => boolean;
    lastKnownElapsedTime: number;
  };
  playbackMode: number;
  services: {
    dispatcher: {
      subscribe: (eventName: string, callback: (data: any) => void) => void;
      unsubscribe: (eventName: string, callback: (data: any) => void) => void;
    };
  };
};

export class SharePlayInhibitor {
  private originalMethods = new Map<
    string,
    { obj: any; prop: string; original: any }
  >();
  private music: MusicKitInstance = (window as any).MusicKit?.getInstance();
  private onSharePlayMediaStateUpdateBound: ((data: unknown) => void) | null =
    null;
  private onSharePlayNextItemBound: (() => void) | null = null;
  private onSharePlayPreviousItemBound: (() => void) | null = null;

  constructor(private readonly hooks: SharePlayHooks = {}) {}

  /** @returns false if MusicKit was not available */
  public inject(): boolean {
    log.debug("injecting");
    log.debug("music", this.music);
    if (!this.music) return false;

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

    if (this.music.services.playActivity) {
      const activity = this.music.services.playActivity;
      const originalHandler = activity.handleEvent;

      activity.handleEvent = function (eventName: string, data: any) {
        try {
          log.debug("handleEvent", eventName, data);
          return originalHandler.apply(this, [eventName, data]);
        } catch (e) {
          log.warn(`analytics suppressed for event: ${eventName}`);
          return;
        }
      };
    }

    // this.music.playbackMode = 3; // SHAREPLAY_PARTICIPANT
    this.music.playbackMode = 1; // MIXED_CONTENT

    this.music.autoplayEnabled = false;

    const raw = (
      this.music as MusicKitInstance & {
        onMediaStateUpdate?: (d: unknown) => void;
      }
    ).onMediaStateUpdate;
    if (typeof raw === "function") {
      this.onSharePlayMediaStateUpdateBound = raw.bind(this.music);
      this.music.services.dispatcher.subscribe(
        "sharePlay.mediaStateUpdate",
        this.onSharePlayMediaStateUpdateBound,
      );
    }
    this.onSharePlayNextItemBound = () => {
      log.debug("nextItem");
    };
    this.onSharePlayPreviousItemBound = () => {
      log.debug("previousItem");
    };
    this.music.services.dispatcher.subscribe(
      "sharePlay.nextItem",
      this.onSharePlayNextItemBound,
    );
    this.music.services.dispatcher.subscribe(
      "sharePlay.previousItem",
      this.onSharePlayPreviousItemBound,
    );

    const forceSkip = async (original: Function) => {
      log.debug("forceSkip");
      const prevMode = this.music.playbackMode;
      this.music.playbackMode = 1;
      await original();
      this.music.playbackMode = prevMode;
    };

    this.patch(this.music, "skipToNextItem", forceSkip);
    this.patch(this.music, "skipToPreviousItem", forceSkip);

    this.hooks.onInjected?.(this.music._sharePlay!.participants);

    log.debug("injected");
    return true;
  }

  /**
   * Remove all patches and restore original behavior
   */
  public eject() {
    log.debug("ejecting");
    this.originalMethods.forEach(({ obj, prop, original }, key) => {
      log.debug("restoring original method", key);
      obj[prop] = original;
    });
    this.originalMethods.clear();

    const music = this.music;
    if (music) {
      music._sharePlay = undefined;
      music.playbackMode = 1; // MIXED_CONTENT
      const dispatcher = music.services?.dispatcher;
      if (dispatcher) {
        if (this.onSharePlayMediaStateUpdateBound) {
          dispatcher.unsubscribe(
            "sharePlay.mediaStateUpdate",
            this.onSharePlayMediaStateUpdateBound,
          );
          this.onSharePlayMediaStateUpdateBound = null;
        }
        if (this.onSharePlayNextItemBound) {
          dispatcher.unsubscribe(
            "sharePlay.nextItem",
            this.onSharePlayNextItemBound,
          );
          this.onSharePlayNextItemBound = null;
        }
        if (this.onSharePlayPreviousItemBound) {
          dispatcher.unsubscribe(
            "sharePlay.previousItem",
            this.onSharePlayPreviousItemBound,
          );
          this.onSharePlayPreviousItemBound = null;
        }
      }
    }

    this.hooks.onEjected?.();

    log.debug("ejected");
  }

  private patch(obj: any, prop: string, wrapper: Function) {
    const original = obj[prop];
    const key = `${obj?.constructor?.name ?? "object"}::${prop}`;
    this.originalMethods.set(key, { obj, prop, original });
    obj[prop] = (...args: any[]) => wrapper(original.bind(obj), ...args);
  }

  public async syncFromServer(serverData: any) {
    log.debug("syncFromServer", serverData);
    if (!this.music) return;

    const playbackState = serverData.playbackState ?? serverData.state ?? 0;

    this.music.autoplayEnabled = false;

    const dedupedQueue = serverData.queue
      .map((item: any) => ({
        ...item,
        attributes: {
          ...item.attributes,
          playParams: {
            ...item.attributes.playParams,
            catalogId: item.id,
            reporting: true,
            reportingId: item.id,
          },
        },
      }))
      .filter(
        (item: any, index: number, self: any) =>
          self.findIndex((t: any) => t.id === item.id) === index,
      );

    const serverPlayingItemId =
      serverData.queue[serverData.index ?? serverData.currentPlayingIndex ?? 0]
        ?.id;
    const playingIndex = dedupedQueue.findIndex(
      (item: any) => item.id === serverPlayingItemId,
    );

    const rawItems = dedupedQueue.map(
      (item: any) => new MusicKit.MediaItem(item),
    );
    /*
    const { items: instantiatedQueue, playingIndex } = dedupeQueueByCatalogId(
      rawItems,
      serverPlayingIndex,
    );
    */
    const instantiatedQueue = rawItems;

    await this.music.stop();

    await this.music.setQueue({
      items: instantiatedQueue,
    });
    await this.music.changeToMediaAtIndex(playingIndex);

    const seekSeconds = (serverData.elapsedTime || 0) / 1000;

    if (this.music._sharePlay) {
      this.music._sharePlay.lastKnownElapsedTime = seekSeconds;
    }

    const resyncPlayback = async () => {
      await this.music.changeToMediaAtIndex(playingIndex);
      if (serverData.elapsedTime > 0) {
        await this.music.seekToTime(seekSeconds);
      }
    };

    if (playbackState === 2) {
      try {
        await this.music.play();
        if (serverData.elapsedTime > 0) {
          await this.music.seekToTime(seekSeconds);
        }
        if (this.music.nowPlayingItemIndex !== playingIndex) {
          log.warn("drift after play, re-pinning", playingIndex);
          await resyncPlayback();
        }
      } catch (e) {
        log.error("error playing", e);
      }
    }

    const payload = {
      autoPlay: serverData.autoPlay ?? true,
      nowPlayingItemIndex: playingIndex,
      queue: instantiatedQueue,
      playbackState,
      repeatMode: serverData.repeatMode ?? 0,
      shuffleMode: serverData.shuffleMode ?? 0,
      playbackElapsedTime: seekSeconds,
      volume: serverData.volume ?? 0.1,
    };

    const expectedSongId =
      instantiatedQueue[playingIndex]?.id != null
        ? String(instantiatedQueue[playingIndex].id)
        : "";

    const refocusIfWrongItem = async (phase: string) => {
      const np = this.music.nowPlayingItem;
      const got = np?.id != null ? String(np.id) : "";
      if (expectedSongId && got !== expectedSongId) {
        log.warn(
          `wrong nowPlaying (${phase}), got=${got}, want=${expectedSongId}`,
        );
        await resyncPlayback();
      }
      if (this.music.nowPlayingItemIndex !== playingIndex) {
        log.warn("index drift ", phase, this.music.nowPlayingItemIndex);
        await resyncPlayback();
      }
    };

    log.debug("publishing mediaStateUpdate", payload);
    const l = this.onSharePlayMediaStateUpdateBound;
    if (l) {
      this.music.services.dispatcher.unsubscribe(
        "sharePlay.mediaStateUpdate",
        l,
      );
    }
    try {
      this.music.services.dispatcher.publish(
        "sharePlay.mediaStateUpdate",
        payload,
      );
      this.hooks.onMediaStatePublished?.(payload);
    } finally {
      if (l) {
        this.music.services.dispatcher.subscribe(
          "sharePlay.mediaStateUpdate",
          l,
        );
      }
    }

    await refocusIfWrongItem("post-publish-sync");
    setTimeout(() => void refocusIfWrongItem("post-publish+50ms"), 50);

    log.debug("played");
    log.debug("elapsedTime", serverData.elapsedTime);
    log.debug("currentPlaybackTime", this.music.currentPlaybackTime);
  }

  public triggerMockSync() {
    log.debug("triggering mock sync");
    this.syncFromServer(JSON.parse(mockSharePlayData));
  }
}
