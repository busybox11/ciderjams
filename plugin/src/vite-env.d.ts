/// <reference types="vite/client" />
/// <reference types="musickit" />
/// <reference path="../node_modules/@types/musickit/types/index.d.ts" />

declare global {
  interface Window {
    MusicKit: typeof MusicKit;
  }
}

export {};
