import { log } from "../../cider/logger";
import { useJamStore } from "../../session/store";
import { showJamAlert } from "../notifications";

export function useJamSessionActions() {
  const jamStore = useJamStore();

  async function createSession() {
    try {
      await jamStore.createJam();
    } catch (e) {
      log.error(e);
    }
  }

  async function joinSession(roomCode: string) {
    try {
      await jamStore.joinJam(roomCode);
    } catch (e) {
      log.error(e);
      const message = e instanceof Error ? e.message : "Could not join session";
      showJamAlert(message, "Couldn't join");
    }
  }

  return { jamStore, createSession, joinSession };
}
