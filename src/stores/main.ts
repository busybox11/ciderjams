import { defineStore } from "pinia";
import { ref } from "vue";

interface JamMember {
  id: string;
  name: string;
  username: string;
  avatar: string;
  isOwner: boolean;
}

interface Jam {
  id: string;
  name: string;
  code: string;
  members: JamMember[];
}

export const useJamStore = defineStore("jam-store", () => {
  const currentJam = ref<Jam | null>(null);

  return {
    currentJam,
  };
});
