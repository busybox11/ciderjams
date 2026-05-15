/**
 * Subset of @ciderapp/pluginkit `ciderapi-types/window.d.ts` without the
 * `declare const MusicKit: any` / `Window.MusicKit: any` lines — those
 * duplicate the global `MusicKit` namespace from @types/musickit and break
 * `MusicKit.MediaItem` and related merges under skipLibCheck.
 */
interface Window {
  chrome: {
    webview: any;
  };
  go: any;
  runtime: any;
  __BUILDINFO__: BUILD_INFO;
  __TAURI__: any;
  APP_VERSION: string;
}

interface BUILD_INFO {
  BUILD_DATE: string;
  APP_VERSION: string;
  GIT_COMMIT: string;
}
