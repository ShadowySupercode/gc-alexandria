import { getNdkContext, activeInboxRelays } from "../ndk.ts";
import { get } from "svelte/store";
import type { NDKEvent } from "@nostr-dev-kit/ndk";
import type NDK from "@nostr-dev-kit/ndk";
import { userStore } from "../stores/userStore.ts";
import { nip19 } from "nostr-tools";
import { npubCache } from "./npubCache.ts";

/**
 * NIP-51 List kinds for user lists
 * @see https://github.com/nostr-protocol/nips/blob/master/51.md
 */
export const NIP51_LIST_KINDS = {
  FOLLOWS: 3, // Follow list
  MUTED: 10000, // Mute list
  PINNED: 10001, // Pin list
  RELAYS: 10002, // Relay list
  PEOPLE: 30000, // Categorized people list
  BOOKMARKS: 30001, // Categorized bookmark list
  COMMUNITIES: 34550, // Community definition
  STARTER_PACKS: 39089, // Starter packs
  MEDIA_STARTER_PACKS: 39092, // Media starter packs
} as const;

/**
 * Get all list kinds that contain people (npubs)
 */
export const PEOPLE_LIST_KINDS = [
  NIP51_LIST_KINDS.FOLLOWS,
  NIP51_LIST_KINDS.PEOPLE,
  NIP51_LIST_KINDS.STARTER_PACKS,
  NIP51_LIST_KINDS.MEDIA_STARTER_PACKS,
] as const;

/**
 * Interface for a user list event
 */
export interface UserListEvent {
  event: NDKEvent;
  kind: number;
  pubkeys: string[];
  listName?: string;
  listDescription?: string;
}

/**
 * Fetch all user lists for a given pubkey
 * @param pubkey - The pubkey to fetch lists for
 * @param listKinds - Array of list kinds to fetch (defaults to all people list kinds)
 * @returns Promise that resolves to an array of UserListEvent objects
 */
export async function fetchUserLists(
  pubkey: string,
  listKinds: number[] = [...PEOPLE_LIST_KINDS],
  ndk?: NDK,
): Promise<UserListEvent[]> {
  const ndkInstance = ndk || getNdkContext();
  if (!ndkInstance) {
    console.warn("fetchUserLists: No NDK instance available");
    return [];
  }

  console.log(
    `fetchUserLists: Fetching lists for ${pubkey}, kinds:`,
    listKinds,
  );

  try {
    const events = await ndkInstance.fetchEvents({
      kinds: listKinds,
      authors: [pubkey],
    });

    const userLists: UserListEvent[] = [];

    for (const event of events) {
      const pubkeys: string[] = [];

      // Extract pubkeys from p-tags
      event.tags.forEach((tag) => {
        if (tag[0] === "p" && tag[1]) {
          pubkeys.push(tag[1]);
        }
      });

      // Extract list metadata from content if available
      let listName: string | undefined;
      let listDescription: string | undefined;

      if (event.content) {
        try {
          const content = JSON.parse(event.content);
          listName = content.name || content.title;
          listDescription = content.description;
        } catch {
          // Content is not JSON, ignore
        }
      }

      // Get list name from d-tag if available (for addressable lists)
      if (!listName && event.kind >= 30000 && event.kind < 40000) {
        const dTag = event.getMatchingTags("d")[0]?.[1];
        if (dTag) {
          listName = dTag;
        }
      }

      userLists.push({
        event,
        kind: event.kind,
        pubkeys,
        listName,
        listDescription,
      });
    }

    console.log(
      `fetchUserLists: Found ${userLists.length} lists with ${userLists.reduce((sum, list) => sum + list.pubkeys.length, 0)} total pubkeys`,
    );
    return userLists;
  } catch (error) {
    console.error("fetchUserLists: Error fetching user lists:", error);
    return [];
  }
}

/**
 * Fetch the current user's lists
 * @param listKinds - Array of list kinds to fetch (defaults to all people list kinds)
 * @param ndk - Optional NDK instance (if not provided, will use getNdkContext)
 * @returns Promise that resolves to an array of UserListEvent objects
 */
export async function fetchCurrentUserLists(
  listKinds: number[] = [...PEOPLE_LIST_KINDS],
  ndk?: NDK,
): Promise<UserListEvent[]> {
  const userState = get(userStore);

  if (!userState.signedIn || !userState.pubkey) {
    console.warn("fetchCurrentUserLists: No active user found in userStore");
    return [];
  }

  console.log("fetchCurrentUserLists: Found user pubkey:", userState.pubkey);
  return fetchUserLists(userState.pubkey, listKinds, ndk);
}

/**
 * Get all pubkeys from user lists
 * @param userLists - Array of UserListEvent objects
 * @returns Set of unique pubkeys
 */
export function getPubkeysFromUserLists(
  userLists: UserListEvent[],
): Set<string> {
  const pubkeys = new Set<string>();

  userLists.forEach((list) => {
    list.pubkeys.forEach((pubkey) => {
      pubkeys.add(pubkey);
    });
  });

  return pubkeys;
}

/**
 * Get pubkeys from a specific list kind
 * @param userLists - Array of UserListEvent objects
 * @param kind - The list kind to filter by
 * @returns Set of unique pubkeys from the specified list kind
 */
export function getPubkeysFromListKind(
  userLists: UserListEvent[],
  kind: number,
): Set<string> {
  const pubkeys = new Set<string>();

  userLists.forEach((list) => {
    if (list.kind === kind) {
      list.pubkeys.forEach((pubkey) => {
        pubkeys.add(pubkey);
      });
    }
  });

  return pubkeys;
}

/**
 * Check if a pubkey is in any of the user's lists
 * @param pubkey - The pubkey to check
 * @param userLists - Array of UserListEvent objects
 * @returns True if the pubkey is in any list
 */
export function isPubkeyInUserLists(
  pubkey: string,
  userLists: UserListEvent[],
): boolean {
  const result = userLists.some((list) => list.pubkeys.includes(pubkey));
  console.log(
    `isPubkeyInUserLists: Checking ${pubkey} against ${userLists.length} lists, result: ${result}`,
  );
  if (result) {
    console.log(
      `isPubkeyInUserLists: Found ${pubkey} in lists:`,
      userLists
        .filter((list) => list.pubkeys.includes(pubkey))
        .map((list) => ({ kind: list.kind, name: list.listName })),
    );
  }
  return result;
}

/**
 * Get the list kinds that contain a specific pubkey
 * @param pubkey - The pubkey to check
 * @param userLists - Array of UserListEvent objects
 * @returns Array of list kinds that contain the pubkey
 */
export function getListKindsForPubkey(
  pubkey: string,
  userLists: UserListEvent[],
): number[] {
  return userLists
    .filter((list) => list.pubkeys.includes(pubkey))
    .map((list) => list.kind);
}

/**
 * Update profile cache when new follows are discovered
 * This ensures follows are always cached and prioritized
 * @param pubkeys - Array of pubkeys to cache profiles for
 */
export async function updateProfileCacheForPubkeys(
  pubkeys: string[],
  ndk?: NDK,
): Promise<void> {
  if (pubkeys.length === 0) return;

  try {
    console.log(`Updating profile cache for ${pubkeys.length} pubkeys`);

    const ndkInstance = ndk || getNdkContext();
    if (!ndkInstance) {
      console.warn("updateProfileCacheForPubkeys: No NDK instance available");
      return;
    }

    // Fetch profiles for all pubkeys in batches
    const batchSize = 20;
    for (let i = 0; i < pubkeys.length; i += batchSize) {
      const batch = pubkeys.slice(i, i + batchSize);

      try {
        const events = await ndkInstance.fetchEvents({
          kinds: [0],
          authors: batch,
        });

        // Cache each profile
        for (const event of events) {
          if (event.content) {
            try {
              const profileData = JSON.parse(event.content);
              const npub = nip19.npubEncode(event.pubkey);
              npubCache.set(npub, profileData);
              console.log(`Cached profile for: ${npub}`);
            } catch (e) {
              console.warn("Failed to parse profile data:", e);
            }
          }
        }
      } catch (error) {
        console.warn("Failed to fetch batch of profiles:", error);
      }
    }

    console.log("Profile cache update completed");
  } catch (error) {
    console.warn("Failed to update profile cache:", error);
  }
}
