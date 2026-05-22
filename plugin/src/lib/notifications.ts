import { DialogAPI } from "@ciderapp/pluginkit";

import { showJamToast } from "../stores/toasts";

export function showJamAlert(message: string, title?: string): void {
  void DialogAPI.createAlert(message, title);
}

/** Auto-dismisses; use for join/leave only. */
export function showJamMemberEvent(message: string, title: string): void {
  showJamToast(message, title);
}

export function jamErrorMessage(raw: string): {
  message: string;
  title: string;
} {
  switch (raw) {
    case "room not found":
      return {
        title: "Couldn't join",
        message:
          "No session exists with that code. Check the code and try again.",
      };
    case "invalid join payload":
      return {
        title: "Couldn't join",
        message: "That session code isn't valid.",
      };
    case "join or create a room first":
      return {
        title: "Not in a session",
        message: "Create or join a session first.",
      };
    default:
      return { title: "Session error", message: raw };
  }
}
