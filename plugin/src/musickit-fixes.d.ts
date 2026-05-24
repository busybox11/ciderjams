/**
 * `declare module "musickit"` does not apply: `@types/musickit` is ambient global
 * typings (`declare namespace MusicKit`), not an importable ES module.
 *
 * You also cannot widen `MusicKitInstance.player` with `interface MusicKitInstance { player?: … }`:
 * declaration merge keeps `player` required (`Player` ∩ optional still resolves as `Player` here).
 *
 * Use `MusicKit.MusicKitInstanceLoose` where `getInstance().player` may be missing, then narrow.
 */
export {};

declare global {
  namespace MusicKit {
    interface MusicKitAppDispatcher {
      subscribe(event: string, callback: (data: unknown) => void): void;
      unsubscribe(event: string, callback: (data: unknown) => void): void;
      publish(event: string, data: unknown): void;
    }

    interface CiderInjectedSharePlay {
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
    }

    /** In-place queue mutation (SharePlay / jam queue apply). */
    interface MutableQueue extends Queue {
      _queueItems: { item: MediaItem }[];
      updateItems(items: MediaItem[]): void;
      readonly isInitiated: boolean;
      position: number;
    }

    interface PlayActivityService {
      handleEvent?: (eventName: string, data: unknown) => unknown;
    }

    /**
     * MusicKit instance without requiring `player`; includes Cider-internal queue + SharePlay fields.
     */
    type MusicKitInstanceLoose = Omit<
      MusicKitInstance,
      "player" | "queue" | "services" | "skipToNextItem" | "skipToPreviousItem"
    > & {
      readonly player?: Player;
      queue: MutableQueue;
      services?: MusicKitInstance["services"] & {
        dispatcher?: MusicKitAppDispatcher;
        playActivity?: PlayActivityService;
      };
      playbackMode: number;
      autoplayEnabled: boolean;
      _sharePlay?: CiderInjectedSharePlay;
      removeEventListener?(name: string, callback: (data: unknown) => void): void;
      loadItems(options: SetQueueOptions): Promise<MediaItem[]>;
      /** Patched by guest SharePlay inhibitor for MIXED_CONTENT skip behavior. */
      skipToNextItem?: (...args: unknown[]) => Promise<unknown>;
      skipToPreviousItem?: (...args: unknown[]) => Promise<unknown>;
    };

    function getInstance(): MusicKitInstanceLoose | undefined;
  }
}
