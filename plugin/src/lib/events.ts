export enum InternalPluginSubscribeEvents {
  QUEUE_HASH_DID_CHANGE = "queueHashDidChange",
}

export const INTERNAL_PLUGIN_QUEUE_SYNC_EVENTS: string[] = [
  InternalPluginSubscribeEvents.QUEUE_HASH_DID_CHANGE,
];

export const INTERNAL_PLUGIN_SUBSCRIBE_EVENTS: string[] = [
  ...INTERNAL_PLUGIN_QUEUE_SYNC_EVENTS,
];

export const internalPluginEvents = new EventTarget();

