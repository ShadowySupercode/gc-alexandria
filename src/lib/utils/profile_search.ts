import { ndkInstance } from '$lib/ndk';
import { getUserMetadata, getNpubFromNip05 } from '$lib/utils/nostrUtils';
import { NDKRelaySet, NDKEvent } from '@nostr-dev-kit/ndk';
import { searchCache } from '$lib/utils/searchCache';
import { communityRelay, profileRelay } from '$lib/consts';
import { get } from 'svelte/store';
import type { NostrProfile, ProfileSearchResult } from './search_types';
import { fieldMatches, nip05Matches, normalizeSearchTerm, COMMON_DOMAINS, createProfileFromEvent } from './search_utils';
import { checkCommunityStatus } from './community_checker';
import { TIMEOUTS } from './search_constants';

/**
 * Search for profiles by various criteria (display name, name, NIP-05, npub)
 */
export async function searchProfiles(searchTerm: string): Promise<ProfileSearchResult> {
  const normalizedSearchTerm = searchTerm.toLowerCase().trim();
  
  // Check cache first
  const cachedResult = searchCache.get('profile', normalizedSearchTerm);
  if (cachedResult) {
    const profiles = cachedResult.events.map(event => {
      try {
        const profileData = JSON.parse(event.content);
        return createProfileFromEvent(event, profileData);
      } catch {
        return null;
      }
    }).filter(Boolean) as NostrProfile[];
    
    const communityStatus = await checkCommunityStatus(profiles);
    return { profiles, Status: communityStatus };
  }

  const ndk = get(ndkInstance);
  if (!ndk) {
    throw new Error('NDK not initialized');
  }

  let foundProfiles: NostrProfile[] = [];
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  // Set a timeout to force completion after profile search timeout
  timeoutId = setTimeout(() => {
    if (foundProfiles.length === 0) {
      // Timeout reached, but no need to log this
    }
  }, TIMEOUTS.PROFILE_SEARCH);

  try {
    // Check if it's a valid npub/nprofile first
    if (normalizedSearchTerm.startsWith('npub') || normalizedSearchTerm.startsWith('nprofile')) {
      try {
        const metadata = await getUserMetadata(normalizedSearchTerm);
        if (metadata) {
          foundProfiles = [metadata];
        }
      } catch (error) {
        console.error('Error fetching metadata for npub:', error);
      }
    } else if (normalizedSearchTerm.includes('@')) {
      // Check if it's a NIP-05 address
      try {
        const npub = await getNpubFromNip05(normalizedSearchTerm);
        if (npub) {
          const metadata = await getUserMetadata(npub);
          const profile: NostrProfile = {
            ...metadata,
            pubkey: npub
          };
          foundProfiles = [profile];
        }
      } catch (e) {
        console.error('[Search] NIP-05 lookup failed:', e);
        // If NIP-05 lookup fails, continue with regular search
      }
    } else {
      // Try searching for NIP-05 addresses that match the search term
      foundProfiles = await searchNip05Domains(normalizedSearchTerm, ndk);

      // If no NIP-05 results found, search for profiles across relays
      if (foundProfiles.length === 0) {
        foundProfiles = await searchProfilesAcrossRelays(normalizedSearchTerm, ndk);
      }
    }

    // Wait for search to complete or timeout
    await new Promise<void>((resolve) => {
      const checkComplete = () => {
        if (timeoutId === null || foundProfiles.length > 0) {
          resolve();
        } else {
          setTimeout(checkComplete, 100);
        }
      };
      checkComplete();
    });

    // Cache the results
    if (foundProfiles.length > 0) {
      const events = foundProfiles.map(profile => {
        const event = new NDKEvent(ndk);
        event.content = JSON.stringify(profile);
        event.pubkey = profile.pubkey || '';
        return event;
      });
      
      const result = {
        events,
        secondOrder: [],
        tTagEvents: [],
        eventIds: new Set<string>(),
        addresses: new Set<string>(),
        searchType: 'profile',
        searchTerm: normalizedSearchTerm
      };
      searchCache.set('profile', normalizedSearchTerm, result);
    }

    // Check community status for all profiles
    const communityStatus = await checkCommunityStatus(foundProfiles);
    return { profiles: foundProfiles, Status: communityStatus };

  } catch (error) {
    console.error('Error searching profiles:', error);
    return { profiles: [], Status: {} };
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Search for NIP-05 addresses across common domains
 */
async function searchNip05Domains(searchTerm: string, ndk: any): Promise<NostrProfile[]> {
  try {
    for (const domain of COMMON_DOMAINS) {
      const nip05Address = `${searchTerm}@${domain}`;
      try {
        const npub = await getNpubFromNip05(nip05Address);
        if (npub) {
          const metadata = await getUserMetadata(npub);
          const profile: NostrProfile = {
            ...metadata,
            pubkey: npub
          };
          return [profile];
        }
      } catch (e) {
        // Continue to next domain
      }
    }
  } catch (e) {
    console.error('[Search] NIP-05 domain search failed:', e);
  }
  return [];
}

/**
 * Search for profiles across relays
 */
async function searchProfilesAcrossRelays(searchTerm: string, ndk: any): Promise<NostrProfile[]> {
  const foundProfiles: NostrProfile[] = [];
  
  // Prioritize community relays for better search results
  const allRelays = Array.from(ndk.pool.relays.values()) as any[];
  const prioritizedRelays = new Set([
    ...allRelays.filter((relay: any) => relay.url === communityRelay),
    ...allRelays.filter((relay: any) => relay.url !== communityRelay)
  ]);
  const relaySet = new NDKRelaySet(prioritizedRelays as any, ndk);

  // Subscribe to profile events
  const sub = ndk.subscribe(
    { kinds: [0] },
    { closeOnEose: true },
    relaySet
  );

  return new Promise((resolve) => {
    sub.on('event', (event: NDKEvent) => {
      try {
        if (!event.content) return;
        const profileData = JSON.parse(event.content);
        const displayName = profileData.displayName || profileData.display_name || '';
        const display_name = profileData.display_name || '';
        const name = profileData.name || '';
        const nip05 = profileData.nip05 || '';
        const about = profileData.about || '';
        
        // Check if any field matches the search term
        const matchesDisplayName = fieldMatches(displayName, searchTerm);
        const matchesDisplay_name = fieldMatches(display_name, searchTerm);
        const matchesName = fieldMatches(name, searchTerm);
        const matchesNip05 = nip05Matches(nip05, searchTerm);
        const matchesAbout = fieldMatches(about, searchTerm);
        
        if (matchesDisplayName || matchesDisplay_name || matchesName || matchesNip05 || matchesAbout) {
          const profile = createProfileFromEvent(event, profileData);
          
          // Check if we already have this profile
          const existingIndex = foundProfiles.findIndex(p => p.pubkey === event.pubkey);
          if (existingIndex === -1) {
            foundProfiles.push(profile);
          }
        }
      } catch (e) {
        // Invalid JSON or other error, skip
      }
    });

    sub.on('eose', () => {
      if (foundProfiles.length > 0) {
        // Deduplicate by pubkey, keep only newest
        const deduped: Record<string, { profile: NostrProfile; created_at: number }> = {};
        for (const profile of foundProfiles) {
          const pubkey = profile.pubkey;
          if (pubkey) {
            // We don't have created_at from getUserMetadata, so just keep the first one
            if (!deduped[pubkey]) {
              deduped[pubkey] = { profile, created_at: 0 };
            }
          }
        }
        const dedupedProfiles = Object.values(deduped).map(x => x.profile);
        resolve(dedupedProfiles);
      } else {
        resolve([]);
      }
    });
  });
} 