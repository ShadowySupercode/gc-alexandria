import { communityRelays } from "$lib/consts";
import { WebSocketPool } from "../data_structures/websocket_pool.ts";
import { RELAY_CONSTANTS, SEARCH_LIMITS } from "./search_constants";

// Cache for pubkeys with kind 1 events on communityRelay
const communityCache = new Map<string, boolean>();

/**
 * Check if a pubkey has posted to the community relay
 */
export async function checkCommunity(pubkey: string): Promise<boolean> {
  if (communityCache.has(pubkey)) {
    return communityCache.get(pubkey)!;
  }

  try {
    // Try each community relay until we find one that works
    for (const relayUrl of communityRelays) {
      try {
        const ws = await WebSocketPool.instance.acquire(relayUrl);
        const result = await new Promise<boolean>((resolve) => {
          ws.send(
            JSON.stringify([
              "REQ",
              RELAY_CONSTANTS.COMMUNITY_REQUEST_ID,
              {
                kinds: RELAY_CONSTANTS.COMMUNITY_REQUEST_KINDS,
                authors: [pubkey],
                limit: SEARCH_LIMITS.COMMUNITY_CHECK,
              },
            ]),
          );
          ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data[0] === "EVENT" && data[2]?.kind === 1) {
              communityCache.set(pubkey, true);
              WebSocketPool.instance.release(ws);
              resolve(true);
            } else if (data[0] === "EOSE") {
              communityCache.set(pubkey, false);
              WebSocketPool.instance.release(ws);
              resolve(false);
            }
          };
        });
        
        if (result) {
          return true;
        }
      } catch {
        // Continue to next relay if this one fails
        continue;
      }
    }
    
    // If we get here, no relay found the user
    communityCache.set(pubkey, false);
    return false;
  } catch {
    communityCache.set(pubkey, false);
    return false;
  }
}

/**
 * Check community status for multiple profiles
 */
export async function checkCommunityStatus(
  profiles: Array<{ pubkey?: string }>,
): Promise<Record<string, boolean>> {
  const communityStatus: Record<string, boolean> = {};

  // Run all community checks in parallel with timeout
  const checkPromises = profiles.map(async (profile) => {
    if (!profile.pubkey) return { pubkey: "", status: false };

    try {
      const status = await Promise.race([
        checkCommunity(profile.pubkey),
        new Promise<boolean>((resolve) => {
          setTimeout(() => resolve(false), 2000); // 2 second timeout per check
        }),
      ]);
      return { pubkey: profile.pubkey, status };
    } catch (error) {
      console.warn("Community status check failed for", profile.pubkey, error);
      return { pubkey: profile.pubkey, status: false };
    }
  });

  // Wait for all checks to complete
  const results = await Promise.allSettled(checkPromises);

  for (const result of results) {
    if (result.status === "fulfilled" && result.value.pubkey) {
      communityStatus[result.value.pubkey] = result.value.status;
    }
  }

  return communityStatus;
}
