import { ndkInstance, activeInboxRelays, activeOutboxRelays } from "../ndk.ts";
import { getUserMetadata, getNpubFromNip05 } from "./nostrUtils.ts";
import NDK, { NDKRelaySet, NDKEvent } from "@nostr-dev-kit/ndk";
import { searchCache } from "./searchCache.ts";
import { searchRelays, communityRelays, secondaryRelays, localRelays } from "../consts.ts";
import { get } from "svelte/store";
import type { NostrProfile, ProfileSearchResult } from "./search_types.ts";
import {
  fieldMatches,
  nip05Matches,
  normalizeSearchTerm,
  createProfileFromEvent,
} from "./search_utils.ts";
import { 
  fetchCurrentUserLists, 
  getPubkeysFromUserLists, 
  isPubkeyInUserLists,
  getListKindsForPubkey,
  updateProfileCacheForPubkeys,
  PEOPLE_LIST_KINDS 
} from "./user_lists.ts";
import { nip19 } from "nostr-tools";
import { TIMEOUTS, SEARCH_LIMITS, CACHE_DURATIONS } from "./search_constants.ts";

// AI-NOTE: 2025-01-24 - User list cache with stale-while-revalidate for performance
// This prevents redundant relay queries by caching user lists for 5 minutes
// Fresh cache: Return immediately
// Stale cache: Return stale data immediately, update in background
// No cache: Wait for fresh data

/**
 * User list cache interface
 */
interface UserListCache {
  lists: any[];
  pubkeys: Set<string>;
  lastUpdated: number;
  isUpdating: boolean;
}

/**
 * Search strategy types
 */
type SearchStrategy = 'npub' | 'nip05' | 'userLists' | 'nip05Domains' | 'relaySearch';

/**
 * Global user list cache instance
 */
let userListCache: UserListCache | null = null;

/**
 * Get user lists with stale-while-revalidate caching
 * Returns cached data immediately if available, updates in background if stale
 */
async function getUserListsWithCache(): Promise<{ lists: any[]; pubkeys: Set<string> }> {
  const now = Date.now();
  
  // If we have fresh cache, return it immediately
  if (userListCache && (now - userListCache.lastUpdated) < CACHE_DURATIONS.SEARCH_CACHE) {
    console.log("profile_search: Using fresh user list cache");
    return {
      lists: userListCache.lists,
      pubkeys: userListCache.pubkeys
    };
  }
  
  // If we have stale cache and no update in progress, return stale data and update in background
  if (userListCache && !userListCache.isUpdating) {
    console.log("profile_search: Using stale user list cache, updating in background");
    
    // Start background update
    userListCache.isUpdating = true;
    updateUserListCacheInBackground().catch(error => {
      console.warn("profile_search: Background user list cache update failed:", error);
      if (userListCache) {
        userListCache.isUpdating = false;
      }
    });
    
    return {
      lists: userListCache.lists,
      pubkeys: userListCache.pubkeys
    };
  }
  
  // If no cache or update in progress, wait for fresh data
  console.log("profile_search: Fetching fresh user lists");
  return await updateUserListCache();
}

/**
 * Update user list cache in background
 */
async function updateUserListCacheInBackground(): Promise<void> {
  try {
    const { lists, pubkeys } = await updateUserListCache();
    console.log("profile_search: Background user list cache update completed");
  } catch (error) {
    console.warn("profile_search: Background user list cache update failed:", error);
  } finally {
    if (userListCache) {
      userListCache.isUpdating = false;
    }
  }
}

/**
 * Update user list cache with fresh data
 */
async function updateUserListCache(): Promise<{ lists: any[]; pubkeys: Set<string> }> {
  const lists = await fetchCurrentUserLists([...PEOPLE_LIST_KINDS]);
  const pubkeys = getPubkeysFromUserLists(lists);
  
  userListCache = {
    lists,
    pubkeys,
    lastUpdated: Date.now(),
    isUpdating: false
  };
  
  console.log(`profile_search: Updated user list cache with ${lists.length} lists and ${pubkeys.size} pubkeys`);
  
  // Update profile cache for all user list pubkeys to ensure follows are cached
  if (pubkeys.size > 0) {
    updateProfileCacheForPubkeys(Array.from(pubkeys)).catch(error => {
      console.warn("profile_search: Failed to update profile cache:", error);
    });
  }
  
  return { lists, pubkeys };
}

/**
 * Clear user list cache (useful for logout or force refresh)
 */
export function clearUserListCache(): void {
  userListCache = null;
  console.log("profile_search: User list cache cleared");
}

/**
 * Force refresh user list cache (useful when user follows/unfollows someone)
 */
export async function refreshUserListCache(): Promise<void> {
  console.log("profile_search: Forcing user list cache refresh");
  userListCache = null;
  await updateUserListCache();
}

/**
 * Get user list cache status for debugging
 */
export function getUserListCacheStatus(): { 
  hasCache: boolean; 
  isStale: boolean; 
  isUpdating: boolean; 
  ageMinutes: number | null;
  listCount: number | null;
  pubkeyCount: number | null;
} {
  if (!userListCache) {
    return { 
      hasCache: false, 
      isStale: false, 
      isUpdating: false, 
      ageMinutes: null,
      listCount: null,
      pubkeyCount: null
    };
  }
  
  const now = Date.now();
  const ageMs = now - userListCache.lastUpdated;
  const ageMinutes = Math.round(ageMs / (60 * 1000));
  const isStale = ageMs > CACHE_DURATIONS.SEARCH_CACHE;
  
  return {
    hasCache: true,
    isStale,
    isUpdating: userListCache.isUpdating,
    ageMinutes,
    listCount: userListCache.lists.length,
    pubkeyCount: userListCache.pubkeys.size
  };
}

/**
 * Wait for NDK to be properly initialized
 */
async function waitForNdk(): Promise<NDK> {
  let ndk = get(ndkInstance);
  if (!ndk) {
    console.log("profile_search: Waiting for NDK initialization...");
    let retryCount = 0;
    const maxRetries = 10;
    const retryDelay = 500; // milliseconds
    
    while (retryCount < maxRetries && !ndk) {
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      ndk = get(ndkInstance);
      retryCount++;
    }
    
    if (!ndk) {
      console.error("profile_search: NDK not initialized after waiting");
      throw new Error("NDK not initialized");
    }
  }
  
  return ndk;
}

/**
 * Check if search term is a valid npub/nprofile identifier
 */
function isNostrIdentifier(searchTerm: string): boolean {
  return searchTerm.startsWith("npub") || searchTerm.startsWith("nprofile");
}

/**
 * Check if search term is a NIP-05 address
 */
function isNip05Address(searchTerm: string): boolean {
  return searchTerm.includes("@");
}

/**
 * Determine search strategy based on search term
 */
function determineSearchStrategy(searchTerm: string): SearchStrategy {
  if (isNostrIdentifier(searchTerm)) {
    return 'npub';
  }
  if (isNip05Address(searchTerm)) {
    return 'nip05';
  }
  return 'userLists'; // Default to user lists first, then other strategies
}

/**
 * Search for profiles by npub/nprofile identifier
 */
async function searchByNostrIdentifier(searchTerm: string, ndk: NDK): Promise<NostrProfile[]> {
  try {
    const cleanId = searchTerm.replace(/^nostr:/, "");
    const decoded = nip19.decode(cleanId);
    
    if (!decoded) {
      return [];
    }
    
    let pubkey: string;
    if (decoded.type === "npub") {
      pubkey = decoded.data;
    } else if (decoded.type === "nprofile") {
      pubkey = decoded.data.pubkey;
    } else {
      console.warn("Unsupported identifier type:", decoded.type);
      return [];
    }
    
    // AI-NOTE: 2025-01-24 - For npub/nprofile searches, fetch the actual event to preserve timestamp
    const events = await ndk.fetchEvents({
      kinds: [0],
      authors: [pubkey],
    });
    
    if (events.size > 0) {
      // Get the most recent profile event
      const event = Array.from(events).sort((a, b) => 
        (b.created_at || 0) - (a.created_at || 0)
      )[0];
      
      if (event && event.content) {
        try {
          const profileData = JSON.parse(event.content);
          const profile = createProfileFromEvent(event, profileData);
          return [profile];
        } catch (error) {
          console.error("Error parsing profile content for npub:", error);
        }
      }
    }
    
    // Fallback to metadata
    const metadata = await getUserMetadata(searchTerm);
    const profileWithPubkey: NostrProfile = {
      ...metadata,
      pubkey: pubkey,
    };
    return [profileWithPubkey];
  } catch (error) {
    console.error("Error fetching metadata for npub:", error);
    return [];
  }
}

/**
 * Search for profiles by NIP-05 address
 */
async function searchByNip05Address(searchTerm: string): Promise<NostrProfile[]> {
  try {
    const normalizedNip05 = searchTerm.toLowerCase();
    const npub = await getNpubFromNip05(normalizedNip05);
    
    if (npub) {
      const metadata = await getUserMetadata(npub);
      const profile: NostrProfile = {
        ...metadata,
        pubkey: npub,
      };
      return [profile];
    }
  } catch (error) {
    console.error("[Search] NIP-05 lookup failed:", error);
  }
  
  return [];
}

/**
 * Fuzzy match function for user list searches
 */
function fuzzyMatch(text: string, searchTerm: string): boolean {
  if (!text || !searchTerm) return false;
  
  const normalizedText = text.toLowerCase();
  const normalizedSearchTerm = searchTerm.toLowerCase();
  
  // Direct substring match
  if (normalizedText.includes(normalizedSearchTerm)) {
    return true;
  }
  
  // AI-NOTE: 2025-01-24 - More strict word boundary matching for profile searches
  // Only match if the search term is a significant part of a word
  const words = normalizedText.split(/[\s\-_\.]+/);
  for (const word of words) {
    // Only match if search term is at least 3 characters and represents a significant part of the word
    if (normalizedSearchTerm.length >= 3) {
      if (word.includes(normalizedSearchTerm) || normalizedSearchTerm.includes(word)) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Search for profiles within user's lists with fuzzy matching
 */
async function searchWithinUserLists(
  searchTerm: string,
  userLists: any[],
  ndk: NDK,
): Promise<NostrProfile[]> {
  const normalizedSearchTerm = normalizeSearchTerm(searchTerm);
  const foundProfiles: NostrProfile[] = [];
  const processedPubkeys = new Set<string>();

  // Get all pubkeys from user lists
  const allPubkeys: string[] = [];
  userLists.forEach(list => {
    list.pubkeys.forEach((pubkey: string) => {
      if (!processedPubkeys.has(pubkey)) {
        allPubkeys.push(pubkey);
        processedPubkeys.add(pubkey);
      }
    });
  });

  if (allPubkeys.length === 0) {
    return foundProfiles;
  }

  console.log(`searchWithinUserLists: Searching ${allPubkeys.length} pubkeys from user lists with fuzzy matching`);

  // Fetch profiles for all pubkeys in batches
  for (let i = 0; i < allPubkeys.length; i += SEARCH_LIMITS.BATCH_SIZE) {
    const batch = allPubkeys.slice(i, i + SEARCH_LIMITS.BATCH_SIZE);
    
    try {
      const events = await ndk.fetchEvents({
        kinds: [0],
        authors: batch,
      });

      for (const event of events) {
        try {
          if (!event.content) continue;
          
          const profileData = JSON.parse(event.content);
          const displayName = profileData.displayName || profileData.display_name || "";
          const name = profileData.name || "";
          const nip05 = profileData.nip05 || "";
          const about = profileData.about || "";

          // Check if any field matches the search term with exact field matching only
          const matchesDisplayName = fieldMatches(displayName, normalizedSearchTerm);
          const matchesName = fieldMatches(name, normalizedSearchTerm);
          const matchesNip05 = nip05Matches(nip05, normalizedSearchTerm);
          const matchesAbout = fieldMatches(about, normalizedSearchTerm);

          if (matchesDisplayName || matchesName || matchesNip05 || matchesAbout) {
            const profile = createProfileFromEvent(event, profileData);
            foundProfiles.push(profile);
          }
        } catch {
          // Invalid JSON, skip
        }
      }
    } catch (error) {
      console.warn("searchWithinUserLists: Error fetching batch:", error);
    }
  }

  console.log(`searchWithinUserLists: Found ${foundProfiles.length} matching profiles in user lists with fuzzy matching`);
  return foundProfiles;
}

/**
 * Search for NIP-05 addresses across common domains
 */
async function searchNip05Domains(searchTerm: string): Promise<NostrProfile[]> {
  const foundProfiles: NostrProfile[] = [];

  // Enhanced list of common domains for NIP-05 lookups
  // Prioritize gitcitadel.com since we know it has profiles
  const commonDomains = [
    "gitcitadel.com", // Prioritize this domain
    "theforest.nostr1.com",
    "nostr1.com",
    "nostr.land",
    "sovbit.host",
    "damus.io",
    "snort.social",
    "iris.to",
    "coracle.social",
    "nostr.band",
    "nostr.wine",
    "purplepag.es",
    "relay.noswhere.com",
    "aggr.nostr.land",
    "nostr.sovbit.host",
    "freelay.sovbit.host",
    "nostr21.com",
    "greensoul.space",
    "relay.damus.io",
    "relay.nostr.band",
  ];

  // Normalize the search term for NIP-05 lookup
  const normalizedSearchTerm = searchTerm.toLowerCase().trim();
  console.log("NIP-05 search: normalized search term:", normalizedSearchTerm);

  // Try gitcitadel.com first with extra debugging
  const gitcitadelAddress = `${normalizedSearchTerm}@gitcitadel.com`;
  console.log("NIP-05 search: trying gitcitadel.com first:", gitcitadelAddress);
  try {
    const npub = await getNpubFromNip05(gitcitadelAddress);
    if (npub) {
      console.log("NIP-05 search: SUCCESS! found npub for gitcitadel.com:", npub);
      const metadata = await getUserMetadata(npub);
      const profile: NostrProfile = {
        ...metadata,
        pubkey: npub,
      };
      console.log("NIP-05 search: created profile for gitcitadel.com:", profile);
      foundProfiles.push(profile);
      return foundProfiles; // Return immediately if we found it on gitcitadel.com
    } else {
      console.log("NIP-05 search: no npub found for gitcitadel.com");
    }
  } catch (error) {
    console.log("NIP-05 search: error for gitcitadel.com:", error);
  }

  // If gitcitadel.com didn't work, try other domains
  console.log("NIP-05 search: gitcitadel.com failed, trying other domains...");
  const otherDomains = commonDomains.filter(domain => domain !== "gitcitadel.com");

  // Search all other domains in parallel with timeout
  const searchPromises = otherDomains.map(async (domain) => {
    const nip05Address = `${normalizedSearchTerm}@${domain}`;
    console.log("NIP-05 search: trying address:", nip05Address);
    try {
      const npub = await getNpubFromNip05(nip05Address);
      if (npub) {
        console.log("NIP-05 search: found npub for", nip05Address, ":", npub);
        const metadata = await getUserMetadata(npub);
        const profile: NostrProfile = {
          ...metadata,
          pubkey: npub,
        };
        console.log("NIP-05 search: created profile for", nip05Address, ":", profile);
        return profile;
      } else {
        console.log("NIP-05 search: no npub found for", nip05Address);
      }
    } catch (error) {
      console.log("NIP-05 search: error for", nip05Address, ":", error);
      // Continue to next domain
    }
    return null;
  });

  // Wait for all searches with timeout
  const results = await Promise.allSettled(searchPromises);

  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      foundProfiles.push(result.value);
    }
  }

  console.log("NIP-05 search: total profiles found:", foundProfiles.length);
  return foundProfiles;
}

/**
 * Get all available relay URLs for comprehensive search
 */
function getAllRelayUrls(): string[] {
  const userInboxRelays = get(activeInboxRelays);
  const userOutboxRelays = get(activeOutboxRelays);
  
  // AI-NOTE: 2025-01-24 - Use ALL available relays for comprehensive profile search coverage
  // This includes all relays from consts.ts, user's personal relays, and local relays
  const allRelayUrls = [
    ...searchRelays,           // Dedicated profile search relays
    ...communityRelays,        // Community relays
    ...secondaryRelays,        // Secondary relays
    ...localRelays,           // Local relays
    ...userInboxRelays,       // User's personal inbox relays  
    ...userOutboxRelays       // User's personal outbox relays
  ];
  
  // Deduplicate relay URLs
  return [...new Set(allRelayUrls)];
}

/**
 * Quick relay search with short timeout
 */
async function quickRelaySearch(searchTerm: string, ndk: NDK): Promise<NostrProfile[]> {
  console.log("quickRelaySearch called with:", searchTerm);

  // Normalize the search term for relay search
  const normalizedSearchTerm = normalizeSearchTerm(searchTerm);
  console.log("Normalized search term for relay search:", normalizedSearchTerm);

  const uniqueRelayUrls = getAllRelayUrls();
  console.log("Using ALL available relays for profile search:", uniqueRelayUrls);
  console.log("Relay breakdown:", {
    searchRelays: searchRelays.length,
    communityRelays: communityRelays.length,
    secondaryRelays: secondaryRelays.length,
    localRelays: localRelays.length,
    userInboxRelays: get(activeInboxRelays).length,
    userOutboxRelays: get(activeOutboxRelays).length,
    totalUnique: uniqueRelayUrls.length
  });

  // Create relay sets for parallel search
  const relaySets = uniqueRelayUrls
    .map((url) => {
      try {
        return NDKRelaySet.fromRelayUrls([url], ndk);
      } catch (error) {
        console.warn(`Failed to create relay set for ${url}:`, error);
        return null;
      }
    })
    .filter(Boolean);

  // Search all relays in parallel with short timeout
  const searchPromises = relaySets.map((relaySet, index) => {
    if (!relaySet) return [];

    return new Promise<NostrProfile[]>((resolve) => {
      const foundInRelay: NostrProfile[] = [];
      let eventCount = 0;

      console.log(`Starting search on relay ${index + 1}: ${uniqueRelayUrls[index]}`);

      const sub = ndk.subscribe(
        { kinds: [0] },
        { closeOnEose: true },
        relaySet,
      );

      sub.on("event", (event: NDKEvent) => {
        eventCount++;
        try {
          if (!event.content) return;
          const profileData = JSON.parse(event.content);
          const displayName = profileData.displayName || profileData.display_name || "";
          const display_name = profileData.display_name || "";
          const name = profileData.name || "";
          const nip05 = profileData.nip05 || "";
          const about = profileData.about || "";

          // Check if any field matches the search term using exact field matching only
          const matchesDisplayName = fieldMatches(displayName, normalizedSearchTerm);
          const matchesDisplay_name = fieldMatches(display_name, normalizedSearchTerm);
          const matchesName = fieldMatches(name, normalizedSearchTerm);
          const matchesNip05 = nip05Matches(nip05, normalizedSearchTerm);
          const matchesAbout = fieldMatches(about, normalizedSearchTerm);

          if (
            matchesDisplayName ||
            matchesDisplay_name ||
            matchesName ||
            matchesNip05 ||
            matchesAbout
          ) {
            console.log(`Found matching profile on relay ${index + 1}:`, {
              name: profileData.name,
              display_name: profileData.display_name,
              nip05: profileData.nip05,
              pubkey: event.pubkey,
              searchTerm: normalizedSearchTerm,
            });
            const profile = createProfileFromEvent(event, profileData);

            // Check if we already have this profile in this relay
            const existingIndex = foundInRelay.findIndex(
              (p) => p.pubkey === event.pubkey,
            );
            if (existingIndex === -1) {
              foundInRelay.push(profile);
            }
          }
        } catch {
          // Invalid JSON or other error, skip
        }
      });

      sub.on("eose", () => {
        console.log(
          `Relay ${index + 1} (${uniqueRelayUrls[index]}) search completed, processed ${eventCount} events, found ${foundInRelay.length} matches`,
        );
        resolve(foundInRelay);
      });

      // Short timeout for quick search
      setTimeout(() => {
        console.log(
          `Relay ${index + 1} (${uniqueRelayUrls[index]}) search timed out after 1.5s, processed ${eventCount} events, found ${foundInRelay.length} matches`,
        );
        sub.stop();
        resolve(foundInRelay);
      }, TIMEOUTS.RELAY_TIMEOUT);
    });
  });

  // Wait for all searches to complete
  const results = await Promise.allSettled(searchPromises);

  // Combine and deduplicate results
  const allProfiles: Record<string, NostrProfile> = {};

  for (const result of results) {
    if (result.status === "fulfilled") {
      for (const profile of result.value) {
        if (profile.pubkey) {
          allProfiles[profile.pubkey] = profile;
        }
      }
    }
  }

  console.log(`Total unique profiles found: ${Object.keys(allProfiles).length}`);
  return Object.values(allProfiles);
}

/**
 * Add user list information to profiles and prioritize them
 */
function prioritizeProfiles(profiles: NostrProfile[], userLists: any[]): NostrProfile[] {
  return profiles.map(profile => {
    if (profile.pubkey) {
      const inLists = isPubkeyInUserLists(profile.pubkey, userLists);
      const listKinds = getListKindsForPubkey(profile.pubkey, userLists);
      return {
        ...profile,
        isInUserLists: inLists,
        listKinds: listKinds,
      };
    }
    return profile;
  }).sort((a, b) => {
    const aInLists = a.isInUserLists || false;
    const bInLists = b.isInUserLists || false;
    
    if (aInLists && !bInLists) return -1;
    if (!aInLists && bInLists) return 1;
    
    // If both are in lists, prioritize by list kind (follows first)
    if (aInLists && bInLists && a.listKinds && b.listKinds) {
      const aHasFollows = a.listKinds.includes(3);
      const bHasFollows = b.listKinds.includes(3);
      
      if (aHasFollows && !bHasFollows) return -1;
      if (!aHasFollows && bHasFollows) return 1;
    }
    
    return 0;
  });
}

/**
 * Cache search results
 */
function cacheSearchResults(profiles: NostrProfile[], searchTerm: string, ndk: NDK): void {
  if (profiles.length > 0) {
    const events = profiles.map((profile) => {
      const event = new NDKEvent(ndk);
      event.content = JSON.stringify(profile);
      event.pubkey = profile.pubkey || "";
      // AI-NOTE: 2025-01-24 - Preserve timestamp for proper date display
      if (profile.created_at) {
        event.created_at = profile.created_at;
      }
      return event;
    });

    const result = {
      events,
      secondOrder: [],
      tTagEvents: [],
      eventIds: new Set<string>(),
      addresses: new Set<string>(),
      searchType: "profile",
      searchTerm: searchTerm,
    };
    searchCache.set("profile", searchTerm, result);
  }
}

/**
 * Get cached search results
 */
function getCachedResults(searchTerm: string): NostrProfile[] | null {
  const cachedResult = searchCache.get("profile", searchTerm);
  if (cachedResult) {
    console.log("Found cached result for:", searchTerm);
    
    const profiles = cachedResult.events
      .map((event) => {
        try {
          const profileData = JSON.parse(event.content);
          return createProfileFromEvent(event, profileData);
        } catch {
          return null;
        }
      })
      .filter(Boolean) as NostrProfile[];

    console.log("Cached profiles found:", profiles.length);
    return profiles;
  }
  
  return null;
}

/**
 * Execute search strategy based on search term type
 */
async function executeSearchStrategy(
  strategy: SearchStrategy,
  searchTerm: string,
  ndk: NDK,
  userLists: any[],
): Promise<NostrProfile[]> {
  switch (strategy) {
    case 'npub':
      return await searchByNostrIdentifier(searchTerm, ndk);
      
    case 'nip05':
      return await searchByNip05Address(searchTerm);
      
    case 'userLists':
      const foundProfiles: NostrProfile[] = [];
      
      // First, search within user's lists for exact matches
      if (userLists.length > 0) {
        console.log("Searching within user's lists first for:", searchTerm);
        const listMatches = await searchWithinUserLists(searchTerm, userLists, ndk);
        foundProfiles.push(...listMatches);
        console.log("User list search completed, found:", listMatches.length, "profiles");
      }

      // If we found enough matches in user lists, return them
      if (foundProfiles.length >= 5) {
        console.log("Found sufficient matches in user lists, skipping other searches");
        return foundProfiles;
      }

      // Try NIP-05 search (faster than relay search)
      console.log("Starting NIP-05 search for:", searchTerm);
      const nip05Profiles = await searchNip05Domains(searchTerm);
      console.log("NIP-05 search completed, found:", nip05Profiles.length, "profiles");
      foundProfiles.push(...nip05Profiles);

      // If still not enough results, try quick relay search
      if (foundProfiles.length < 10) {
        console.log("Not enough results, trying quick relay search");
        const relayProfiles = await quickRelaySearch(searchTerm, ndk);
        console.log("Quick relay search completed, found:", relayProfiles.length, "profiles");
        foundProfiles.push(...relayProfiles);
      }
      
              // AI-NOTE: 2025-01-24 - Limit results to prevent overwhelming the UI
        // For profile searches, we want quality over quantity
        if (foundProfiles.length > SEARCH_LIMITS.MAX_PROFILE_RESULTS) {
          console.log(`Limiting results from ${foundProfiles.length} to ${SEARCH_LIMITS.MAX_PROFILE_RESULTS} most relevant profiles`);
          return foundProfiles.slice(0, SEARCH_LIMITS.MAX_PROFILE_RESULTS);
        }
      
      return foundProfiles;
      
    default:
      return [];
  }
}

/**
 * Search for profiles by various criteria (display name, name, NIP-05, npub)
 * Prioritizes profiles from user's lists (follows, etc.)
 */
export async function searchProfiles(searchTerm: string): Promise<ProfileSearchResult> {
  const normalizedSearchTerm = normalizeSearchTerm(searchTerm);

  console.log("searchProfiles called with:", searchTerm, "normalized:", normalizedSearchTerm);

  // Check cache first
  const cachedProfiles = getCachedResults(normalizedSearchTerm);
  if (cachedProfiles) {
    return { profiles: cachedProfiles, Status: {} };
  }

  // Get user lists with stale-while-revalidate caching
  let userLists: any[] = [];
  let userPubkeys: Set<string> = new Set();
  try {
    const userListResult = await getUserListsWithCache();
    userLists = userListResult.lists;
    userPubkeys = userListResult.pubkeys;
    console.log(`searchProfiles: Using user lists - ${userLists.length} lists with ${userPubkeys.size} unique pubkeys`);
  } catch (error) {
    console.warn("searchProfiles: Failed to get user lists:", error);
  }

  // Wait for NDK to be properly initialized
  const ndk = await waitForNdk();
  console.log("profile_search: NDK initialized, starting search logic");

  try {
    // Determine search strategy
    const strategy = determineSearchStrategy(normalizedSearchTerm);
    console.log("profile_search: Using search strategy:", strategy);

    // Execute search strategy
    const foundProfiles = await executeSearchStrategy(strategy, normalizedSearchTerm, ndk, userLists);

    // Cache the results
    cacheSearchResults(foundProfiles, normalizedSearchTerm, ndk);

    // Add user list information to profiles and prioritize them
    const prioritizedProfiles = prioritizeProfiles(foundProfiles, userLists);

    console.log("Search completed, found profiles:", foundProfiles.length);
    console.log("Prioritized profiles - follows first:", prioritizedProfiles.length);
    return { profiles: prioritizedProfiles, Status: {} };
  } catch (error) {
    console.error("Error searching profiles:", error);
    return { profiles: [], Status: {} };
  }
}
