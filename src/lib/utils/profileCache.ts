import NDK, { type NDKEvent } from "@nostr-dev-kit/ndk";
import { nip19 } from "nostr-tools";
import { toNpub } from "./nostrUtils";

interface ProfileData {
  display_name?: string;
  name?: string;
  picture?: string;
  about?: string;
}

// Cache for user profiles
const profileCache = new Map<string, ProfileData>();

/**
 * Fetches profile data for a pubkey
 * @param pubkey - The public key to fetch profile for
 * @returns Profile data or null if not found
 */
async function fetchProfile(pubkey: string, ndk: NDK): Promise<ProfileData | null> {
  try {
    const profileEvents = await ndk.fetchEvents({
      kinds: [0],
      authors: [pubkey],
      limit: 1,
    });

    if (profileEvents.size === 0) {
      return null;
    }

    // Get the most recent profile event
    const profileEvent = Array.from(profileEvents)[0];

    try {
      const content = JSON.parse(profileEvent.content);
      return content as ProfileData;
    } catch (e) {
      console.error("Failed to parse profile content:", e);
      return null;
    }
  } catch (e) {
    console.error("Failed to fetch profile:", e);
    return null;
  }
}

/**
 * Gets the display name for a pubkey, using cache
 * @param pubkey - The public key to get display name for
 * @returns Display name, name, or shortened npub (never hex ID)
 */
export async function getDisplayName(pubkey: string, ndk: NDK): Promise<string> {
  // Check cache first
  if (profileCache.has(pubkey)) {
    const profile = profileCache.get(pubkey)!;
    const npub = toNpub(pubkey);
    return profile.display_name || profile.name || (npub ? shortenNpub(npub) : pubkey);
  }

  // Fetch profile
  const profile = await fetchProfile(pubkey, ndk);
  if (profile) {
    profileCache.set(pubkey, profile);
    const npub = toNpub(pubkey);
    return profile.display_name || profile.name || (npub ? shortenNpub(npub) : pubkey);
  }

  // Fallback to shortened npub or pubkey
  const npub = toNpub(pubkey);
  return npub ? shortenNpub(npub) : pubkey;
}

/**
 * Batch fetches profiles for multiple pubkeys
 * @param pubkeys - Array of public keys to fetch profiles for
 * @param onProgress - Optional callback for progress updates
 * @returns Array of profile events
 */
export async function batchFetchProfiles(
  pubkeys: string[],
  ndk: NDK,
  onProgress?: (fetched: number, total: number) => void,
): Promise<NDKEvent[]> {
  const allProfileEvents: NDKEvent[] = [];

  // Filter out already cached pubkeys
  const uncachedPubkeys = pubkeys.filter((pk) => !profileCache.has(pk));

  if (uncachedPubkeys.length === 0) {
    if (onProgress) onProgress(pubkeys.length, pubkeys.length);
    return allProfileEvents;
  }

  try {
    // Report initial progress
    const cachedCount = pubkeys.length - uncachedPubkeys.length;
    if (onProgress) onProgress(cachedCount, pubkeys.length);

    // Batch fetch in chunks to avoid overwhelming relays
    const CHUNK_SIZE = 50;
    let fetchedCount = cachedCount;

    for (let i = 0; i < uncachedPubkeys.length; i += CHUNK_SIZE) {
      const chunk = uncachedPubkeys.slice(
        i,
        Math.min(i + CHUNK_SIZE, uncachedPubkeys.length),
      );

      const profileEvents = await ndk.fetchEvents({
        kinds: [0],
        authors: chunk,
      });

      // Process each profile event
      profileEvents.forEach((event: NDKEvent) => {
        try {
          const content = JSON.parse(event.content);
          profileCache.set(event.pubkey, content as ProfileData);
          allProfileEvents.push(event);
          fetchedCount++;
        } catch (e) {
          console.error("Failed to parse profile content:", e);
        }
      });

      // Update progress
      if (onProgress) {
        onProgress(fetchedCount, pubkeys.length);
      }
    }

    // Final progress update
    if (onProgress) onProgress(pubkeys.length, pubkeys.length);
  } catch (e) {
    console.error("Failed to batch fetch profiles:", e);
  }

  return allProfileEvents;
}

/**
 * Gets display name synchronously from cache
 * @param pubkey - The public key to get display name for
 * @returns Display name, name, or shortened npub (never hex ID)
 */
export function getDisplayNameSync(pubkey: string): string {
  if (profileCache.has(pubkey)) {
    const profile = profileCache.get(pubkey)!;
    const npub = toNpub(pubkey);
    return profile.display_name || profile.name || (npub ? shortenNpub(npub) : pubkey);
  }
  const npub = toNpub(pubkey);
  return npub ? shortenNpub(npub) : pubkey;
}

/**
 * Shortens an npub for display
 * @param npub - The npub to shorten
 * @returns Shortened npub (first 8 chars...last 4 chars)
 */
function shortenNpub(npub: string): string {
  if (npub.length <= 12) return npub;
  return `${npub.slice(0, 8)}...${npub.slice(-4)}`;
}

/**
 * Clears the profile cache
 */
export function clearProfileCache(): void {
  profileCache.clear();
}

/**
 * Extracts all pubkeys from events (authors and p tags)
 * @param events - Array of events to extract pubkeys from
 * @returns Set of unique pubkeys
 */
export function extractPubkeysFromEvents(events: NDKEvent[]): Set<string> {
  const pubkeys = new Set<string>();

  events.forEach((event) => {
    // Add author pubkey
    if (event.pubkey) {
      pubkeys.add(event.pubkey);
    }

    // Add pubkeys from p tags
    const pTags = event.getMatchingTags("p");
    pTags.forEach((tag) => {
      if (tag[1]) {
        pubkeys.add(tag[1]);
      }
    });

    // Extract pubkeys from content (nostr:npub1... format)
    const npubPattern = /nostr:npub1[a-z0-9]{58}/g;
    const matches = event.content?.match(npubPattern) || [];
    matches.forEach((match) => {
      try {
        const npub = match.replace("nostr:", "");
        const decoded = nip19.decode(npub);
        if (decoded.type === "npub") {
          pubkeys.add(decoded.data as string);
        }
      } catch (e) {
        // Invalid npub, ignore
      }
    });
  });

  return pubkeys;
}

/**
 * Replaces pubkeys in content with display names
 * @param content - The content to process
 * @returns Content with pubkeys replaced by display names
 */
export function replaceContentPubkeys(content: string): string {
  if (!content) return content;

  // Replace nostr:npub1... references
  const npubPattern = /nostr:npub[a-z0-9]{58}/g;
  let result = content;

  const matches = content.match(npubPattern) || [];
  matches.forEach((match) => {
    try {
      const npub = match.replace("nostr:", "");
      const decoded = nip19.decode(npub);
      if (decoded.type === "npub") {
        const pubkey = decoded.data as string;
        const displayName = getDisplayNameSync(pubkey);
        result = result.replace(match, `@${displayName}`);
      }
    } catch (e) {
      // Invalid npub, leave as is
    }
  });

  return result;
}

/**
 * Replaces pubkey references in text with display names
 * @param text - Text that may contain pubkey references
 * @returns Text with pubkeys replaced by display names
 */
export function replacePubkeysWithDisplayNames(text: string): string {
  // Match hex pubkeys (64 characters)
  const pubkeyRegex = /\b[0-9a-fA-F]{64}\b/g;

  return text.replace(pubkeyRegex, (match) => {
    return getDisplayNameSync(match);
  });
}
