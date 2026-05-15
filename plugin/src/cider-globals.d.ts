/// <reference path="../node_modules/@ciderapp/pluginkit/build/api/ciderapi-types/index.d.ts" />
/// <reference path="./cider-window-globals.d.ts" />
/// <reference path="../node_modules/@types/musickit/types/index.d.ts" />
/// <reference path="./musickit-fixes.d.ts" />

declare global {
  interface Window {
    __PLUGINSYS__: typeof __PLUGINSYS__;
  }
}

export {};
