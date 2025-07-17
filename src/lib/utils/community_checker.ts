import { communityRelay } from '$lib/consts';
import { RELAY_CONSTANTS, SEARCH_LIMITS } from './search_constants';

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
    const relayUrl = communityRelay;
    const ws = new WebSocket(relayUrl);
    return await new Promise((resolve) => {
      ws.onopen = () => {
        ws.send(JSON.stringify([
          'REQ', RELAY_CONSTANTS.COMMUNITY_REQUEST_ID, { 
            kinds: RELAY_CONSTANTS.COMMUNITY_REQUEST_KINDS, 
            authors: [pubkey], 
            limit: SEARCH_LIMITS.COMMUNITY_CHECK 
          }
        ]));
      };
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data[0] === 'EVENT' && data[2]?.kind === 1) {
          communityCache.set(pubkey, true);
          ws.close();
          resolve(true);
        } else if (data[0] === 'EOSE') {
          communityCache.set(pubkey, false);
          ws.close();
          resolve(false);
        }
      };
      ws.onerror = () => {
        communityCache.set(pubkey, false);
        ws.close();
        resolve(false);
      };
    });
  } catch {
    communityCache.set(pubkey, false);
    return false;
  }
}

/**
 * Check community status for multiple profiles
 */
export async function checkCommunityStatus(profiles: Array<{ pubkey?: string }>): Promise<Record<string, boolean>> {
  const communityStatus: Record<string, boolean> = {};
  
  for (const profile of profiles) {
    if (profile.pubkey) {
      communityStatus[profile.pubkey] = await checkCommunity(profile.pubkey);
    }
  }
  
  return communityStatus;
} 