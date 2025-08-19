// deno-lint-ignore-file no-explicit-any
import { ndkInstance } from "../ndk.ts";
import { getMatchingTags } from "./nostrUtils.ts";
import { nip19 } from "./nostrUtils.ts";
import { NDKRelaySet, NDKEvent } from "@nostr-dev-kit/ndk";
import { searchCache } from "./searchCache.ts";
import { communityRelays, searchRelays, secondaryRelays, localRelays } from "../consts.ts";
import { get } from "svelte/store";
import type {
  SearchResult,
  SearchSubscriptionType,
  SearchFilter,
  SearchCallbacks,
} from "./search_types.ts";
import {
  fieldMatches,
  nip05Matches,
  isEmojiReaction,
} from "./search_utils.ts";
import { TIMEOUTS, SEARCH_LIMITS } from "./search_constants.ts";
import { activeInboxRelays, activeOutboxRelays } from "../ndk.ts";
// AI-NOTE: 2025-01-24 - User list functionality is now handled by centralized searchProfiles function
import { searchProfiles } from "./profile_search.ts";

// Helper function to normalize URLs for comparison
const normalizeUrl = (url: string): string => {
  return url.replace(/\/$/, ''); // Remove trailing slash
};

/**
 * Filter out unwanted events from search results
 * @param events Array of NDKEvent to filter
 * @returns Filtered array of NDKEvent
 */
function filterUnwantedEvents(events: NDKEvent[]): NDKEvent[] {
  return events.filter(
    (event) => !isEmojiReaction(event) && event.kind !== 3 && event.kind !== 5,
  );
}

/**
 * Search for events by subscription type (d, t, n)
 */
export async function searchBySubscription(
  searchType: SearchSubscriptionType,
  searchTerm: string,
  callbacks?: SearchCallbacks,
  abortSignal?: AbortSignal,
): Promise<SearchResult> {
  const startTime = Date.now(); // AI-NOTE: 2025-01-08 - Track search performance
  const normalizedSearchTerm = searchTerm.toLowerCase().trim();

  console.log("subscription_search: Starting search:", {
    searchType,
    searchTerm,
    normalizedSearchTerm,
  });

  // For profile searches (n:), use the centralized searchProfiles function
  if (searchType === "n") {
    console.log("subscription_search: Using centralized searchProfiles for profile search");
    try {
      const profileResult = await searchProfiles(searchTerm);
      
      // Get NDK instance for creating events
      const ndk = get(ndkInstance);
      if (!ndk) {
        console.error("subscription_search: NDK not initialized for profile search");
        throw new Error("NDK not initialized");
      }
      
      // Convert profile results to NDK events for compatibility
      const events = await Promise.all(profileResult.profiles.map(async (profile) => {
        const event = new NDKEvent(ndk);
        
        // AI-NOTE: 2025-01-24 - Clean profile data before JSON serialization to prevent corruption
        const cleanProfile = {
          name: profile.name,
          displayName: profile.displayName,
          display_name: profile.displayName, // AI-NOTE: 2025-01-24 - Use displayName for both fields for compatibility
          nip05: profile.nip05,
          picture: profile.picture,
          about: profile.about,
          banner: profile.banner,
          website: profile.website,
          lud16: profile.lud16,
          pubkey: profile.pubkey,
          created_at: profile.created_at,
          isInUserLists: profile.isInUserLists,
          listKinds: profile.listKinds,
        };
        
        event.content = JSON.stringify(cleanProfile);
        event.pubkey = profile.pubkey || "";
        event.kind = 0;
        // AI-NOTE: 2025-01-24 - Preserve timestamp for proper date display
        if (profile.created_at) {
          event.created_at = profile.created_at;
        }
        
        // AI-NOTE: 2025-01-24 - Generate a proper ID for the event
        // This is required for the event details panel to work correctly
        if (profile.pubkey) {
          // Create a deterministic ID based on pubkey and kind
          const idData = new TextEncoder().encode(`${profile.pubkey}:0:${profile.created_at || Date.now()}`);
          const hashBuffer = await crypto.subtle.digest('SHA-256', idData);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const eventId = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
          event.id = eventId;
        }
        
        // AI-NOTE: 2025-01-24 - Attach profile data directly to event for easy access
        // This ensures user list information is preserved
        (event as any).profileData = cleanProfile;
        
        return event;
      }));
      
      const result = {
        events,
        secondOrder: [],
        tTagEvents: [],
        eventIds: new Set<string>(),
        addresses: new Set<string>(),
        searchType: "n",
        searchTerm: normalizedSearchTerm,
      };
      
      // AI-NOTE: 2025-01-24 - Perform second-order search for n: searches
      // This finds events that mention the found profiles
      if (events.length > 0) {
        performSecondOrderSearchInBackground(
          "n",
          events,
          new Set<string>(),
          new Set<string>(),
          events[0].pubkey, // Use first profile's pubkey for second-order search
          callbacks,
        );
      }
      
      // Cache the result
      searchCache.set(searchType, normalizedSearchTerm, result);
      
      return result;
    } catch (error) {
      console.error("subscription_search: Error in centralized profile search:", error);
      throw error;
    }
  }
  
  // Check cache first for other search types
  const cachedResult = searchCache.get(searchType, normalizedSearchTerm);
  if (cachedResult) {
    console.log("subscription_search: Found cached result:", cachedResult);
    return cachedResult;
  }

  const ndk = get(ndkInstance);
  if (!ndk) {
    console.error("subscription_search: NDK not initialized");
    throw new Error("NDK not initialized");
  }

  console.log("subscription_search: NDK initialized, creating search state");
  const searchState = createSearchState();
  const cleanup = createCleanupFunction(searchState);

  // User lists are now handled by the centralized searchProfiles function
  // No need to fetch them here for n: searches

  // Set a timeout to force completion after subscription search timeout
  searchState.timeoutId = setTimeout(() => {
    console.log("subscription_search: Search timeout reached");
    cleanup();
  }, TIMEOUTS.SUBSCRIPTION_SEARCH); // AI-NOTE: 2025-01-24 - Use standard timeout since cache is checked first

  // Check for abort signal
  if (abortSignal?.aborted) {
    console.log("subscription_search: Search aborted");
    cleanup();
    throw new Error("Search cancelled");
  }

  const searchFilter = await createSearchFilter(
    searchType,
    normalizedSearchTerm,
  );
  console.log("subscription_search: Created search filter:", searchFilter);
  const primaryRelaySet = createPrimaryRelaySet(searchType, ndk);
  console.log(
    "subscription_search: Created primary relay set with",
    primaryRelaySet.relays.size,
    "relays",
  );

  // Phase 1: Search primary relay
  if (primaryRelaySet.relays.size > 0) {
    try {
      console.log(
        "subscription_search: Searching primary relay with filter:",
        searchFilter.filter,
      );
      const primaryEvents = await ndk.fetchEvents(
        searchFilter.filter,
        { closeOnEose: true },
        primaryRelaySet,
      );

      console.log(
        "subscription_search: Primary relay returned",
        primaryEvents.size,
        "events",
      );
      processPrimaryRelayResults(
        primaryEvents,
        searchType,
        searchFilter.subscriptionType,
        normalizedSearchTerm,
        searchState,
        abortSignal,
        cleanup,
      );

      // If we found results from primary relay, return them immediately
      if (hasResults(searchState, searchType)) {
        console.log(
          "subscription_search: Found results from primary relay, returning immediately",
        );
        const immediateResult = createSearchResult(
          searchState,
          searchType,
          normalizedSearchTerm,
        );
        searchCache.set(searchType, normalizedSearchTerm, immediateResult);

        // Start Phase 2 in background for additional results
        searchOtherRelaysInBackground(
          searchType,
          searchFilter,
          searchState,
          callbacks,
          cleanup,
        );

        return immediateResult;
      } else {
        console.log(
          "subscription_search: No results from primary relay",
        );
        
        console.log(
          "subscription_search: No results from primary relay, continuing to Phase 2",
        );
      }
    } catch (error) {
      console.error(
        `subscription_search: Error searching primary relay:`,
        error,
      );
    }
  } else {
    console.log(
      "subscription_search: No primary relays available, skipping Phase 1",
    );
  }

  // Always do Phase 2: Search all other relays in parallel
  const result = await searchOtherRelaysInBackground(
    searchType,
    searchFilter,
    searchState,
    callbacks,
    cleanup,
  );
  
  // Log performance for all searches
  const elapsed = Date.now() - startTime;
  console.log(`subscription_search: ${searchType} search completed in ${elapsed}ms`);
  
  return result;
}

/**
 * Create search state object
 */
function createSearchState() {
  return {
    timeoutId: null as ReturnType<typeof setTimeout> | null,
    firstOrderEvents: [] as NDKEvent[],
    secondOrderEvents: [] as NDKEvent[],
    tTagEvents: [] as NDKEvent[],
    eventIds: new Set<string>(),
    eventAddresses: new Set<string>(),
    // AI-NOTE: 2025-01-24 - foundProfiles removed as profile searches are now handled by centralized searchProfiles function
    isCompleted: false,
    currentSubscription: null as any,
    // AI-NOTE: 2025-01-24 - userLists and userPubkeys removed as they're now handled by centralized searchProfiles function
  };
}

/**
 * Create cleanup function
 */
function createCleanupFunction(searchState: any) {
  return () => {
    if (searchState.timeoutId) {
      clearTimeout(searchState.timeoutId);
      searchState.timeoutId = null;
    }
    if (searchState.currentSubscription) {
      try {
        searchState.currentSubscription.stop();
      } catch (e) {
        console.warn("Error stopping subscription:", e);
      }
      searchState.currentSubscription = null;
    }
  };
}

/**
 * Create search filter based on search type
 */
async function createSearchFilter(
  searchType: SearchSubscriptionType,
  normalizedSearchTerm: string,
): Promise<SearchFilter> {
  console.log("subscription_search: Creating search filter for:", {
    searchType,
    normalizedSearchTerm,
  });

  switch (searchType) {
    case "d": {
      const dFilter = {
        filter: { "#d": [normalizedSearchTerm], limit: SEARCH_LIMITS.GENERAL_CONTENT },
        subscriptionType: "d-tag",
      };
      console.log("subscription_search: Created d-tag filter:", dFilter);
      return dFilter;
    }
    case "t": {
      const tFilter = {
        filter: { "#t": [normalizedSearchTerm], limit: SEARCH_LIMITS.GENERAL_CONTENT },
        subscriptionType: "t-tag",
      };
      console.log("subscription_search: Created t-tag filter:", tFilter);
      return tFilter;
    }
    case "n": {
      const nFilter = await createProfileSearchFilter(normalizedSearchTerm);
      console.log("subscription_search: Created profile filter:", nFilter);
      return nFilter;
    }
    default: {
      throw new Error(`Unknown search type: ${searchType}`);
    }
  }
}

/**
 * Create profile search filter
 * AI-NOTE: 2025-01-24 - This function is now redundant as profile searches are handled by centralized searchProfiles function
 * Keeping minimal implementation for compatibility with existing code structure
 */
async function createProfileSearchFilter(
  normalizedSearchTerm: string,
): Promise<SearchFilter> {
  // AI-NOTE: 2025-01-24 - Profile search logic is now centralized in profile_search.ts
  // This function is kept for compatibility but profile searches should go through searchProfiles function
  return {
    filter: { kinds: [0], limit: SEARCH_LIMITS.GENERAL_PROFILE },
    subscriptionType: "profile",
  };
}

/**
 * Create primary relay set for search operations
 * AI-NOTE: 2025-01-24 - Updated to use all available relays to prevent search failures
 */
function createPrimaryRelaySet(
  searchType: SearchSubscriptionType,
  ndk: any,
): NDKRelaySet {
  // Debug: Log all relays in NDK pool
  const poolRelays = Array.from(ndk.pool.relays.values());
  console.debug('subscription_search: NDK pool relays:', poolRelays.map((r: any) => r.url));
  
  // AI-NOTE: 2025-01-24 - Use ALL available relays for comprehensive search coverage
  // This ensures searches don't fail due to missing relays and provides maximum event discovery
  
  if (searchType === "n") {
    // For profile searches, prioritize search relays for speed but include all relays
    const searchRelaySet = poolRelays.filter(
      (relay: any) =>
        searchRelays.some(
          (searchRelay: string) =>
            normalizeUrl(relay.url) === normalizeUrl(searchRelay),
        ),
    );
    
    if (searchRelaySet.length > 0) {
      console.debug('subscription_search: Profile search - using search relays for speed:', searchRelaySet.map((r: any) => r.url));
      // Still include all relays for comprehensive coverage
      console.debug('subscription_search: Profile search - also including all relays for comprehensive coverage');
      return new NDKRelaySet(new Set(poolRelays) as any, ndk);
    } else {
      // Use all relays if search relays not available
      console.debug('subscription_search: Profile search - using all relays:', poolRelays.map((r: any) => r.url));
      return new NDKRelaySet(new Set(poolRelays) as any, ndk);
    }
  } else {
    // For all other searches, use ALL available relays for maximum coverage
    const activeRelays = [...get(activeInboxRelays), ...get(activeOutboxRelays)];
    console.debug('subscription_search: Active relay stores:', {
      inboxRelays: get(activeInboxRelays),
      outboxRelays: get(activeOutboxRelays),
      activeRelays
    });
    
    // AI-NOTE: 2025-01-24 - Use all pool relays instead of filtering to active relays only
    // This ensures we don't miss events that might be on other relays
    console.debug('subscription_search: Using ALL pool relays for comprehensive search coverage:', poolRelays.map((r: any) => r.url));
    return new NDKRelaySet(new Set(poolRelays) as any, ndk);
  }
}

/**
 * Process primary relay results
 */
function processPrimaryRelayResults(
  events: Set<NDKEvent>,
  searchType: SearchSubscriptionType,
  subscriptionType: string,
  normalizedSearchTerm: string,
  searchState: any,
  abortSignal?: AbortSignal,
  cleanup?: () => void,
) {
  console.log(
    "subscription_search: Processing",
    events.size,
    "events from primary relay",
  );

  for (const event of events) {
    // Check for abort signal
    if (abortSignal?.aborted) {
      cleanup?.();
      throw new Error("Search cancelled");
    }

    try {
      if (searchType === "n") {
        // AI-NOTE: 2025-01-24 - Profile processing is now handled by centralized searchProfiles function
        // No need to process profile events here as they're handled in profile_search.ts
      } else {
        processContentEvent(event, searchType, searchState);
      }
    } catch (e) {
      console.warn("subscription_search: Error processing event:", e);
      // Invalid JSON or other error, skip
    }
  }

  console.log(
    "subscription_search: Processed events - firstOrder:",
    searchState.firstOrderEvents.length,
    "tTag:",
    searchState.tTagEvents.length,
  );
}

/**
 * Process content event
 */
function processContentEvent(
  event: NDKEvent,
  searchType: SearchSubscriptionType,
  searchState: any,
) {
  if (isEmojiReaction(event)) return; // Skip emoji reactions

  if (searchType === "d") {
    console.log("subscription_search: Processing d-tag event:", {
      id: event.id,
      kind: event.kind,
      pubkey: event.pubkey,
    });
    searchState.firstOrderEvents.push(event);

    // Collect event IDs and addresses for second-order search
    if (event.id) {
      searchState.eventIds.add(event.id);
    }
    // Handle both "a" tags (NIP-62) and "e" tags (legacy)
    let tags = getMatchingTags(event, "a");
    if (tags.length === 0) {
      tags = getMatchingTags(event, "e");
    }

    tags.forEach((tag: string[]) => {
      if (tag[1]) {
        searchState.eventAddresses.add(tag[1]);
      }
    });
  } else if (searchType === "t") {
    searchState.tTagEvents.push(event);
  }
}

/**
 * Check if search state has results
 */
function hasResults(
  searchState: any,
  searchType: SearchSubscriptionType,
): boolean {
  // AI-NOTE: 2025-01-24 - Profile searches (n:) are now handled by centralized searchProfiles function
  if (searchType === "d") {
    return searchState.firstOrderEvents.length > 0;
  } else if (searchType === "t") {
    return searchState.tTagEvents.length > 0;
  }
  return false;
}

/**
 * Create search result from state
 */
function createSearchResult(
  searchState: any,
  searchType: SearchSubscriptionType,
  normalizedSearchTerm: string,
): SearchResult {
  let events;
  
  // AI-NOTE: 2025-01-24 - Profile searches (n:) are now handled by centralized searchProfiles function
  if (searchType === "t") {
    events = searchState.tTagEvents;
  } else {
    events = searchState.firstOrderEvents;
  }
  
  return {
    events,
    secondOrder: [],
    tTagEvents: [],
    eventIds: searchState.eventIds,
    addresses: searchState.eventAddresses,
    searchType: searchType,
    searchTerm: normalizedSearchTerm,
  };
}

/**
 * Search other relays in background
 */
function searchOtherRelaysInBackground(
  searchType: SearchSubscriptionType,
  searchFilter: SearchFilter,
  searchState: any,
  callbacks?: SearchCallbacks,
  cleanup?: () => void,
): Promise<SearchResult> {
  const ndk = get(ndkInstance);

  // AI-NOTE: 2025-01-24 - Use ALL available relays for comprehensive search coverage
  // This ensures we don't miss events that might be on any available relay
  const allRelays = Array.from(ndk.pool.relays.values());
  const otherRelays = new NDKRelaySet(
    new Set(allRelays),
    ndk,
  );
  
  console.debug('subscription_search: Background search using ALL relays:', 
    allRelays.map((r: any) => r.url));

  // Subscribe to events from other relays
  const sub = ndk.subscribe(
    searchFilter.filter,
    { closeOnEose: true },
    otherRelays,
  );

  // Store the subscription for cleanup
  searchState.currentSubscription = sub;

  // Notify the component about the subscription for cleanup
  if (callbacks?.onSubscriptionCreated) {
    callbacks.onSubscriptionCreated(sub);
  }

  sub.on("event", (event: NDKEvent) => {
    try {
      if (searchType === "n") {
        // AI-NOTE: 2025-01-24 - Profile processing is now handled by centralized searchProfiles function
        // No need to process profile events here as they're handled in profile_search.ts
      } else {
        processContentEvent(event, searchType, searchState);
      }
    } catch {
      // Invalid JSON or other error, skip
    }
  });

  return new Promise<SearchResult>((resolve) => {
    sub.on("eose", () => {
      const result = processEoseResults(
        searchType,
        searchState,
        searchFilter,
        callbacks,
      );
      searchCache.set(searchType, searchState.normalizedSearchTerm, result);
      cleanup?.();
      resolve(result);
    });
  });
}

/**
 * Process EOSE results
 */
function processEoseResults(
  searchType: SearchSubscriptionType,
  searchState: any,
  searchFilter: SearchFilter,
  callbacks?: SearchCallbacks,
): SearchResult {
  // AI-NOTE: 2025-01-24 - Profile searches (n:) are now handled by centralized searchProfiles function
  if (searchType === "d") {
    return processContentEoseResults(searchState, searchType);
  } else if (searchType === "t") {
    return processTTagEoseResults(searchState);
  } else if (searchType === "n") {
    // AI-NOTE: 2025-01-24 - n: searches are handled by centralized searchProfiles function
    // Second-order search is performed in the main searchBySubscription function
    return createEmptySearchResult(searchType, searchState.normalizedSearchTerm);
  }

  return createEmptySearchResult(searchType, searchState.normalizedSearchTerm);
}

// AI-NOTE: 2025-01-24 - processProfileEoseResults function removed as profile searches are now handled by centralized searchProfiles function

/**
 * Process content EOSE results
 */
function processContentEoseResults(
  searchState: any,
  searchType: SearchSubscriptionType,
): SearchResult {
  if (searchState.firstOrderEvents.length === 0) {
    return createEmptySearchResult(
      searchType,
      searchState.normalizedSearchTerm,
    );
  }

  // Deduplicate by kind, pubkey, and d-tag, keep only newest event for each combination
  const deduped: Record<string, { event: NDKEvent; created_at: number }> = {};
  for (const event of searchState.firstOrderEvents) {
    const dTag = getMatchingTags(event, "d")[0]?.[1] || "";
    const key = `${event.kind}:${event.pubkey}:${dTag}`;
    const created_at = event.created_at || 0;
    if (!deduped[key] || deduped[key].created_at < created_at) {
      deduped[key] = { event, created_at };
    }
  }
  const dedupedEvents = Object.values(deduped).map((x) => x.event);

  // Perform second-order search for d-tag searches
  if (dedupedEvents.length > 0) {
    performSecondOrderSearchInBackground(
      "d",
      dedupedEvents,
      searchState.eventIds,
      searchState.eventAddresses,
    );
  }

  return {
    events: dedupedEvents,
    secondOrder: [],
    tTagEvents: [],
    eventIds: searchState.eventIds,
    addresses: searchState.eventAddresses,
    searchType: searchType,
    searchTerm: searchState.normalizedSearchTerm,
  };
}

/**
 * Process t-tag EOSE results
 */
function processTTagEoseResults(searchState: any): SearchResult {
  if (searchState.tTagEvents.length === 0) {
    return createEmptySearchResult("t", searchState.normalizedSearchTerm);
  }

  // AI-NOTE: 2025-01-24 - Perform second-order search for t-tag searches
  // This finds events that reference the t-tag events
  if (searchState.tTagEvents.length > 0) {
    // Collect event IDs and addresses from t-tag events for second-order search
    const eventIds = new Set<string>();
    const addresses = new Set<string>();
    
    for (const event of searchState.tTagEvents) {
      if (event.id) {
        eventIds.add(event.id);
      }
      // Handle both "a" tags (NIP-62) and "e" tags (legacy)
      let tags = getMatchingTags(event, "a");
      if (tags.length === 0) {
        tags = getMatchingTags(event, "e");
      }
      tags.forEach((tag: string[]) => {
        if (tag[1]) {
          addresses.add(tag[1]);
        }
      });
    }
    
    performSecondOrderSearchInBackground(
      "d", // Use "d" type for second-order search since t-tag events are addressable
      searchState.tTagEvents,
      eventIds,
      addresses,
    );
  }

  return {
    events: searchState.tTagEvents,
    secondOrder: [],
    tTagEvents: [],
    eventIds: new Set(),
    addresses: new Set(),
    searchType: "t",
    searchTerm: searchState.normalizedSearchTerm,
  };
}

/**
 * Create empty search result
 */
function createEmptySearchResult(
  searchType: SearchSubscriptionType,
  searchTerm: string,
): SearchResult {
  return {
    events: [],
    secondOrder: [],
    tTagEvents: [],
    eventIds: new Set(),
    addresses: new Set(),
    searchType: searchType,
    searchTerm: searchTerm,
  };
}

/**
 * Perform second-order search in background
 */
async function performSecondOrderSearchInBackground(
  searchType: "n" | "d",
  firstOrderEvents: NDKEvent[],
  eventIds: Set<string> = new Set(),
  addresses: Set<string> = new Set(),
  targetPubkey?: string,
  callbacks?: SearchCallbacks,
) {
  try {
    console.log("subscription_search: Starting second-order search for", searchType, "with targetPubkey:", targetPubkey);
    const ndk = get(ndkInstance);
    let allSecondOrderEvents: NDKEvent[] = [];

    // Set a timeout for second-order search
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error("Second-order search timeout")),
        TIMEOUTS.SECOND_ORDER_SEARCH,
      );
    });

    const searchPromise = (async () => {
      if (searchType === "n" && targetPubkey) {
        console.log("subscription_search: Searching for events mentioning pubkey:", targetPubkey);
        
        // AI-NOTE: 2025-01-24 - Use only active relays for second-order profile search to prevent hanging
        const activeRelays = [...get(activeInboxRelays), ...get(activeOutboxRelays)];
        const availableRelays = activeRelays
          .map(url => ndk.pool.relays.get(url))
          .filter((relay): relay is any => relay !== undefined);
        const relaySet = new NDKRelaySet(
          new Set(availableRelays),
          ndk
        );
        
        console.log("subscription_search: Using", activeRelays.length, "active relays for second-order search");
        
        // AI-NOTE: 2025-01-24 - Search for events that mention this pubkey in various tags
        // Focus on events that are actually about the profile, not just random mentions
        const searchFilters = [
          { authors: [targetPubkey], limit: 50 }, // Events written by this pubkey (most relevant)
          { "#p": [targetPubkey], limit: 25 }, // p-tags (mentions) - reduced limit
          { "#q": [targetPubkey], limit: 25 }, // q-tags (quotes) - reduced limit
        ];
        
        const searchPromises = searchFilters.map(async (filter, index) => {
          const filterName = index === 0 ? "author" : index === 1 ? "p-tag" : "q-tag";
          try {
            const events = await ndk.fetchEvents(filter, { closeOnEose: true }, relaySet);
            console.log(`subscription_search: Found ${events.size} events with ${filterName} for ${targetPubkey}`);
            return filterUnwantedEvents(Array.from(events));
          } catch (error) {
            console.warn(`subscription_search: Error searching ${filterName}:`, error);
            return [];
          }
        });
        
        const searchResults = await Promise.allSettled(searchPromises);
        
        // Combine all results, prioritizing author events
        for (const result of searchResults) {
          if (result.status === "fulfilled") {
            allSecondOrderEvents.push(...result.value);
          }
        }
        
        // AI-NOTE: 2025-01-24 - Filter events to ensure they're relevant to the profile
        // Remove events that are just random mentions without meaningful content
        const relevantEvents = allSecondOrderEvents.filter(event => {
          // Always include events written by the target pubkey
          if (event.pubkey === targetPubkey) {
            return true;
          }
          
          // For events that mention the pubkey, check if they have meaningful content
          if (event.content && event.content.trim().length > 0) {
            // Include events with substantial content (more than just a mention)
            return event.content.trim().length > 10;
          }
          
          // Include events with tags that suggest they're about the profile
          const pTags = getMatchingTags(event, "p");
          const qTags = getMatchingTags(event, "q");
          if (pTags.length > 0 || qTags.length > 0) {
            return true;
          }
          
          return false;
        });
        
        // AI-NOTE: 2025-01-24 - Further filter to prioritize events that are actually about the profile
        // This helps reduce noise from random mentions
        const highQualityEvents = relevantEvents.filter(event => {
          // Always keep events written by the target pubkey
          if (event.pubkey === targetPubkey) {
            return true;
          }
          
          // For events by others, require more substantial content
          if (event.content && event.content.trim().length > 0) {
            const content = event.content.toLowerCase();
            // Prefer events that mention the profile name or have substantial discussion
            return content.length > 20; // Require more substantial content
          }
          
          // Keep events with relevant tags but limit them
          const pTags = getMatchingTags(event, "p");
          const qTags = getMatchingTags(event, "q");
          return pTags.length > 0 || qTags.length > 0;
        });
        
        allSecondOrderEvents = highQualityEvents;
        console.log("subscription_search: Total relevant second-order events found:", allSecondOrderEvents.length);
      } else if (searchType === "d") {
        // Parallel fetch for #e and #a tag events
        const allRelays = Array.from(ndk.pool.relays.values());
        const relaySet = new NDKRelaySet(
          new Set(allRelays),
          ndk,
        );
        console.debug('subscription_search: Second-order search using ALL relays:', 
          allRelays.map((r: any) => r.url));
        
        const [eTagEvents, aTagEvents] = await Promise.all([
          eventIds.size > 0
            ? ndk.fetchEvents(
                { "#e": Array.from(eventIds), limit: SEARCH_LIMITS.SECOND_ORDER_RESULTS },
                { closeOnEose: true },
                relaySet,
              )
            : Promise.resolve([]),
          addresses.size > 0
            ? ndk.fetchEvents(
                { "#a": Array.from(addresses), limit: SEARCH_LIMITS.SECOND_ORDER_RESULTS },
                { closeOnEose: true },
                relaySet,
              )
            : Promise.resolve([]),
        ]);
        // Filter out unwanted events
        const filteredETagEvents = filterUnwantedEvents(Array.from(eTagEvents));
        const filteredATagEvents = filterUnwantedEvents(Array.from(aTagEvents));
        allSecondOrderEvents = [
          ...allSecondOrderEvents,
          ...filteredETagEvents,
          ...filteredATagEvents,
        ];
      }

      // Deduplicate by event ID
      const uniqueSecondOrder = new Map<string, NDKEvent>();
      allSecondOrderEvents.forEach((event) => {
        if (event.id) {
          uniqueSecondOrder.set(event.id, event);
        }
      });

      let deduplicatedSecondOrder = Array.from(uniqueSecondOrder.values());

      // Remove any events already in first order
      const firstOrderIds = new Set(firstOrderEvents.map((e) => e.id));
      deduplicatedSecondOrder = deduplicatedSecondOrder.filter(
        (e) => !firstOrderIds.has(e.id),
      );

      // Sort by creation date (newest first) and limit to newest results
      const sortedSecondOrder = deduplicatedSecondOrder
        .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
        .slice(0, SEARCH_LIMITS.SECOND_ORDER_RESULTS);

      console.log("subscription_search: Second-order search completed with", sortedSecondOrder.length, "results");

      // Update the search results with second-order events
      const result: SearchResult = {
        events: firstOrderEvents,
        secondOrder: sortedSecondOrder,
        tTagEvents: [],
        eventIds:
          searchType === "n"
            ? new Set(firstOrderEvents.map((p) => p.id))
            : eventIds,
        addresses: searchType === "n" ? new Set() : addresses,
        searchType: searchType,
        searchTerm: "", // This will be set by the caller
      };

      // Notify UI of updated results
      if (callbacks?.onSecondOrderUpdate) {
        console.log("subscription_search: Calling onSecondOrderUpdate callback with", sortedSecondOrder.length, "second-order events");
        callbacks.onSecondOrderUpdate(result);
      } else {
        console.log("subscription_search: No onSecondOrderUpdate callback available");
      }
    })();

    // Race between search and timeout
    await Promise.race([searchPromise, timeoutPromise]);
  } catch (err) {
    console.error(
      `[Search] Error in second-order ${searchType}-tag search:`,
      err,
    );
  }
}
