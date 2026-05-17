/**
 * `declare module "musickit"` does not apply: `@types/musickit` is ambient global
 * typings (`declare namespace MusicKit`), not an importable ES module.
 *
 * You also cannot widen `MusicKitInstance.player` with `interface MusicKitInstance { player?: … }`:
 * declaration merge keeps `player` required (`Player` ∩ optional still resolves as `Player` here).
 *
 * Use `MusicKit.MusicKitInstanceLoose` where `getInstance().player` may be missing, then narrow.
 */
export { };

declare global {
  namespace MusicKit {
    type MusicKitInstanceLoose = Omit<MusicKitInstance, "player"> & {
      readonly player?: Player;

      // might not be the best property for this
      // TODO: continue digging into MusicKit's minified bundle to figure out
      // how to properly type internal Resource object constructors
      // and expected return types.
      // Best effort guess, works good enough™ for now
      loadItems(options: SetQueueOptions): Promise<MediaItem[]>;
    };
  }
}
