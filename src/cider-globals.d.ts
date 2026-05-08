/// <reference path="../node_modules/@ciderapp/pluginkit/build/api/ciderapi-types/index.d.ts" />
/// <reference path="../node_modules/@ciderapp/pluginkit/build/api/ciderapi-types/window.d.ts" />

declare global {
  interface Window {
    __PLUGINSYS__: typeof __PLUGINSYS__;
  }
}

export {};
