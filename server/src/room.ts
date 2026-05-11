import { roomMeta as roomMetaSchema, type roomMeta } from "@ciderjams/proto";

export class Room {
  readonly #meta: roomMeta;

  constructor(meta: roomMeta) {
    this.#meta = roomMetaSchema.parse(meta);
  }

  get meta(): Readonly<roomMeta> {
    return this.#meta;
  }
}
