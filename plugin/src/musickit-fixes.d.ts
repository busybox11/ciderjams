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
    type MusicKitInstanceLoose = Omit<MusicKitInstance, "player"> & {
      readonly player?: Player;
    };
  }
}
