import { mockSharePlayData } from "./mock";

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
    participants: { id: string; name: string }[];
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
  private originalMethods: Map<string, any> = new Map();
  private music: MusicKitInstance = (window as any).MusicKit?.getInstance();
  private onSharePlayMediaStateUpdateBound: ((data: unknown) => void) | null =
    null;

  public inject() {
    console.debug("[shareplay] injecting");
    console.debug("[shareplay] music", this.music);
    if (!this.music) return;

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
          console.debug("[shareplay] handleEvent", eventName, data);
          return originalHandler.apply(this, [eventName, data]);
        } catch (e) {
          console.warn(
            `[shareplay] analytics suppressed for event: ${eventName}`,
          );
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
    this.music.services.dispatcher.subscribe("sharePlay.nextItem", () => {
      console.debug("[shareplay] nextItem");
    });
    this.music.services.dispatcher.subscribe("sharePlay.previousItem", () => {
      console.debug("[shareplay] previousItem");
    });

    const forceSkip = async (original: Function) => {
      console.debug("[shareplay] forceSkip");
      const prevMode = this.music.playbackMode;
      this.music.playbackMode = 1;
      await original();
      this.music.playbackMode = prevMode;
    };

    this.patch(this.music, "skipToNextItem", forceSkip);
    this.patch(this.music, "skipToPreviousItem", forceSkip);

    console.debug("[shareplay] injected");
  }

  /**
   * Remove all patches and restore original behavior
   */
  public eject() {
    console.debug("[shareplay] ejecting");
    this.originalMethods.forEach((original, key) => {
      console.debug("[shareplay] restoring original method", key);
      const { obj, prop } = JSON.parse(key);
      obj[prop] = original;
    });

    this.music._sharePlay = undefined;
    this.music.playbackMode = 1; // MIXED_CONTENT
    if (this.onSharePlayMediaStateUpdateBound) {
      this.music.services.dispatcher.unsubscribe(
        "sharePlay.mediaStateUpdate",
        this.onSharePlayMediaStateUpdateBound,
      );
      this.onSharePlayMediaStateUpdateBound = null;
    }
    this.music.services.dispatcher.unsubscribe("sharePlay.nextItem", () => {});
    this.music.services.dispatcher.unsubscribe(
      "sharePlay.previousItem",
      () => {},
    );

    console.debug("[shareplay] ejected");
  }

  private patch(obj: any, prop: string, wrapper: Function) {
    const original = obj[prop];
    this.originalMethods.set(
      JSON.stringify({ objName: obj.constructor.name, prop }),
      original,
    );
    obj[prop] = (...args: any[]) => wrapper(original.bind(obj), ...args);
  }

  private async syncFromServer(serverData: any) {
    console.debug("[shareplay] syncFromServer", serverData);
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
          console.warn(
            "[shareplay] drift after play, re-pinning",
            playingIndex,
          );
          await resyncPlayback();
        }
      } catch (e) {
        console.error("[shareplay] error playing", e);
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
        console.warn(
          `[shareplay] wrong nowPlaying (${phase}), got=${got}, want=${expectedSongId}`,
        );
        await resyncPlayback();
      }
      if (this.music.nowPlayingItemIndex !== playingIndex) {
        console.warn(
          "[shareplay] index drift ",
          phase,
          this.music.nowPlayingItemIndex,
        );
        await resyncPlayback();
      }
    };

    console.debug("[shareplay] publishing mediaStateUpdate", payload);
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

    console.debug("[shareplay] played");
    console.debug("[shareplay] elapsedTime", serverData.elapsedTime);
    console.debug(
      "[shareplay] currentPlaybackTime",
      this.music.currentPlaybackTime,
    );
  }

  public triggerMockSync() {
    console.debug("[shareplay] triggering mock sync");
    this.syncFromServer(JSON.parse(mockSharePlayData));
  }
}
