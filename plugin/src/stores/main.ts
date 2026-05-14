import { useMusicKit } from "@ciderapp/pluginkit";
import { defineStore } from "pinia";
import { ref } from "vue";

import { roomParticipant } from "@ciderjams/proto";

interface Jam {
  id: string;
  name: string;
  code: string;
  members: roomParticipant[];
}

export const useJamStore = defineStore("jam-store", () => {
  const identity = ref<roomParticipant | null>(null);
  const currentJam = ref<Jam | null>(null);

  async function refreshIdentity() {
    try {
      const musicKit = useMusicKit();
      const result = await musicKit.api.personalSocialProfile();
      identity.value = {
        userId: "",
        name: result.attributes.name,
        handle: result.attributes.handle,
        avatar: MusicKit.formatArtworkURL(
          result.attributes.artwork,
          64,
          64,
        ).replace("{c}", ".webp"),
      };
    } catch (error) {
      console.error("Failed to fetch identity:", error);
    }
  }
  // runs once on store init
  void refreshIdentity();

  return {
    currentJam,
    identity,
  };
});
