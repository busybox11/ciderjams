import type { RoomStateSchema } from "@ciderjams/proto";

import { showJamMemberEvent } from "../ui/notifications";

export function notifyParticipantChanges(
  prev: RoomStateSchema,
  next: RoomStateSchema,
  myUserId: string | undefined,
) {
  const prevIds = new Set(prev.participants.map((p) => p.userId));
  const nextIds = new Set(next.participants.map((p) => p.userId));

  for (const p of next.participants) {
    if (!prevIds.has(p.userId) && p.userId !== myUserId) {
      showJamMemberEvent(`${p.name} joined the session.`, "Member joined");
    }
  }

  for (const p of prev.participants) {
    if (!nextIds.has(p.userId) && p.userId !== myUserId && p.userId !== prev.hostUserId) {
      showJamMemberEvent(`${p.name} left the session.`, "Member left");
    }
  }
}

export function hostLeftSession(prev: RoomStateSchema, next: RoomStateSchema): boolean {
  return !next.participants.some((p) => p.userId === prev.hostUserId);
}

export type RoomStateTransition =
  | { kind: "applied"; next: RoomStateSchema }
  | { kind: "host_left" };

export function transitionRoomState(
  prev: RoomStateSchema | null,
  next: RoomStateSchema,
  options: { isHost: boolean; myUserId: string | undefined },
): RoomStateTransition {
  if (prev) {
    if (!options.isHost && hostLeftSession(prev, next)) {
      return { kind: "host_left" };
    }
    notifyParticipantChanges(prev, next, options.myUserId);
  }
  return { kind: "applied", next };
}
