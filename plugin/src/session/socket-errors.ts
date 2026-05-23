import { jamErrorMessage, showJamAlert } from "../ui/notifications";

export function handleJamSocketError(
  rawMessage: string,
  ctx: {
    pendingRoomJoin: boolean;
    hasCurrentJam: boolean;
    onPendingJoinFailed: () => void;
  },
): void {
  const { message, title } = jamErrorMessage(rawMessage);
  if (ctx.pendingRoomJoin && !ctx.hasCurrentJam) {
    ctx.onPendingJoinFailed();
    showJamAlert(message, title);
    return;
  }
  if (ctx.hasCurrentJam) showJamAlert(message, title);
}
