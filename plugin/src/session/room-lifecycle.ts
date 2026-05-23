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
