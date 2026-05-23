import type { roomParticipant } from "@ciderjams/proto";

import { useMusicKit } from "@ciderapp/pluginkit";
import type { Ref } from "vue";

import { log } from "../cider/logger";

export async function fetchJamIdentity(): Promise<roomParticipant | null> {
  try {
    const musicKit = useMusicKit();
    const result = await musicKit.api.personalSocialProfile();
    const handle = result.attributes.handle;
    const resource = result as { id?: string };

    // TODO: remove this - only for multi platform debug
    const isLinux = window.navigator.userAgent.toLowerCase().includes("linux");

    if (isLinux) {
      return {
        userId:
          typeof resource.id === "string" && resource.id.length > 0
            ? `${resource.id}-linux`
            : `handle:${handle}-linux`,
        name: `${result.attributes.name} (Linux)`,
        handle: `${handle}-linux`,
        avatar: "https://pbs.twimg.com/profile_images/1994727967587528704/p5QVaU0q_400x400.jpg",
      };
    }

    return {
      userId:
        typeof resource.id === "string" && resource.id.length > 0
          ? resource.id
          : `handle:${handle}`,
      name: result.attributes.name,
      handle,
      avatar: MusicKit.formatArtworkURL(result.attributes.artwork, 64, 64).replace("{c}", ".webp"),
    };
  } catch (error) {
    log.error("Failed to fetch identity:", error);
    return null;
  }
}

export async function ensureJamIdentity(
  identity: Ref<roomParticipant | null>,
): Promise<roomParticipant> {
  if (identity.value) return identity.value;
  identity.value = await fetchJamIdentity();
  if (!identity.value) {
    throw new Error("Could not load Apple Music profile");
  }
  return identity.value;
}

export function prefetchJamIdentity(identity: Ref<roomParticipant | null>): void {
  void fetchJamIdentity().then((participant) => {
    identity.value = participant;
  });
}
