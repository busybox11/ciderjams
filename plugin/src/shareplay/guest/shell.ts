import type { RoomStateSchema } from "@ciderjams/proto";

const PENDING_SHAREPLAY_ID = "cider-jams-pending";

export function createCiderSharePlayShell(
  room?: RoomStateSchema | null,
  lastKnownElapsedTime = 0,
): MusicKit.CiderInjectedSharePlay {
  return {
    id: room?.roomId ?? PENDING_SHAREPLAY_ID,
    mediaState: {
      capabilities: {
        autoPlayControl: true,
        repeatControl: true,
        shuffleControl: true,
        volumeControl: true,
      },
    },
    participants: room
      ? room.participants.map((p) => ({ id: p.userId, name: p.name }))
      : [],
    checkCapability: () => true,
    shouldUpdate: () => true,
    lastKnownElapsedTime,
  };
}

export function applyRoomToCiderSharePlay(
  sharePlay: MusicKit.CiderInjectedSharePlay,
  room: RoomStateSchema,
): void {
  sharePlay.id = room.roomId;
  sharePlay.participants = room.participants.map((p) => ({
    id: p.userId,
    name: p.name,
  }));
}
