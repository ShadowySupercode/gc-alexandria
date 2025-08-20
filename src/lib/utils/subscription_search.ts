// deno-lint-ignore-file no-explicit-any
import { getMatchingTags, getNpubFromNip05 } from "./nostrUtils.ts";
import { nip19 } from "./nostrUtils.ts";
import NDK, { NDKEvent, NDKRelaySet } from "@nostr-dev-kit/ndk";
import { searchCache } from "./searchCache.ts";
import { searchRelays } from "../consts.ts";
import { get } from "svelte/store";
import type {
  SearchCallbacks,
  SearchFilter,
  SearchResult,
  SearchSubscriptionType,
} from "./search_types.ts";
import {
  COMMON_DOMAINS,
  fieldMatches,
  isEmojiReaction,
  nip05Matches,
} from "./search_utils.ts";
import { SEARCH_LIMITS, TIMEOUTS } from "./search_constants.ts";
import { activeInboxRelays, activeOutboxRelays } from "../ndk.ts";

// Helper function to normalize URLs for comparison
const normalizeUrl = (url: string): string => {
  return url.replace(/\/$/, ""); // Remove trailing slash
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
  ndk: NDK,
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

  // Check cache first
  const cachedResult = searchCache.get(searchType, normalizedSearchTerm);
  if (cachedResult) {
    console.log("subscription_search: Found cached result:", cachedResult);
    
    // AI-NOTE: 2025-01-24 - Ensure cached events have created_at property preserved
    // This fixes the "Unknown date" issue when events are retrieved from cache
    const eventsWithCreatedAt = cachedResult.events.map(event => {
      if (event && typeof event === 'object' && !event.created_at) {
        console.warn("subscription_search: Event missing created_at, setting to 0:", event.id);
        (event as any).created_at = 0;
      }
      return event;
    });
    
    const secondOrderWithCreatedAt = cachedResult.secondOrder.map(event => {
      if (event && typeof event === 'object' && !event.created_at) {
        console.warn("subscription_search: Second order event missing created_at, setting to 0:", event.id);
        (event as any).created_at = 0;
      }
      return event;
    });
    
    const tTagEventsWithCreatedAt = cachedResult.tTagEvents.map(event => {
      if (event && typeof event === 'object' && !event.created_at) {
        console.warn("subscription_search: T-tag event missing created_at, setting to 0:", event.id);
        (event as any).created_at = 0;
      }
      return event;
    });
    
    const resultWithCreatedAt = {
      ...cachedResult,
      events: eventsWithCreatedAt,
      secondOrder: secondOrderWithCreatedAt,
      tTagEvents: tTagEventsWithCreatedAt
    };
    
    // AI-NOTE: 2025-01-24 - For profile searches, return cached results immediately
    // The EventSearch component now handles cache checking before calling this function
    if (searchType === "n") {
      console.log(
        "subscription_search: Returning cached profile result immediately",
      );
      return resultWithCreatedAt;
    } else {
      return resultWithCreatedAt;
    }
  }

  if (!ndk) {
    console.error("subscription_search: NDK not initialized");
    throw new Error("NDK not initialized");
  }

  console.log("subscription_search: NDK initialized, creating search state");
  const searchState = createSearchState();
  const cleanup = createCleanupFunction(searchState);

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
    ndk,
  );
  console.log("subscription_search: Created search filter:", searchFilter);
  const primaryRelaySet = createPrimaryRelaySet(searchType, ndk);
  console.log(
    "subscription_search: Created primary relay set with",
    primaryRelaySet.relays.size,
    "relays",
  );

  // AI-NOTE: 2025-01-24 - Check for preloaded events first (for profile searches)
  if (searchFilter.preloadedEvents && searchFilter.preloadedEvents.length > 0) {
    console.log("subscription_search: Using preloaded events:", searchFilter.preloadedEvents.length);
    processPrimaryRelayResults(
      new Set(searchFilter.preloadedEvents),
      searchType,
      searchFilter.subscriptionType,
      normalizedSearchTerm,
      searchState,
      abortSignal,
      cleanup,
    );
    
    if (hasResults(searchState, searchType)) {
      console.log("subscription_search: Found results from preloaded events, returning immediately");
      const immediateResult = createSearchResult(
        searchState,
        searchType,
        normalizedSearchTerm,
      );
      searchCache.set(searchType, normalizedSearchTerm, immediateResult);
      return immediateResult;
    }
  }

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

        // AI-NOTE: 2025-01-08 - For profile searches, return immediately when found
        // but still start background search for second-order results
        if (searchType === "n") {
          console.log(
            "subscription_search: Profile found, returning immediately but starting background second-order search",
          );

          // Start Phase 2 in background for second-order results
          searchOtherRelaysInBackground(
            searchType,
            searchFilter,
            searchState,
            ndk,
            callbacks,
            cleanup,
          );

          const elapsed = Date.now() - startTime;
          console.log(
            `subscription_search: Profile search completed in ${elapsed}ms`,
          );
          return immediateResult;
        }

        // Start Phase 2 in background for additional results (only for non-profile searches)
        searchOtherRelaysInBackground(
          searchType,
          searchFilter,
          searchState,
          ndk,
          callbacks,
          cleanup,
        );

        return immediateResult;
      } else {
        console.log(
          "subscription_search: No results from primary relay",
        );

        // AI-NOTE: 2025-01-08 - For profile searches, if no results found in search relays,
        // try all relays as fallback
        if (searchType === "n") {
          console.log(
            "subscription_search: No profile found in search relays, trying all relays",
          );
          // Try with all relays as fallback
          const allRelaySet = new NDKRelaySet(
            new Set(Array.from(ndk.pool.relays.values())) as any,
            ndk,
          );
          try {
            const fallbackEvents = await ndk.fetchEvents(
              searchFilter.filter,
              { closeOnEose: true },
              allRelaySet,
            );

            console.log(
              "subscription_search: Fallback search returned",
              fallbackEvents.size,
              "events",
            );

            processPrimaryRelayResults(
              fallbackEvents,
              searchType,
              searchFilter.subscriptionType,
              normalizedSearchTerm,
              searchState,
              abortSignal,
              cleanup,
            );

            if (hasResults(searchState, searchType)) {
              console.log(
                "subscription_search: Found profile in fallback search, returning immediately",
              );
              const fallbackResult = createSearchResult(
                searchState,
                searchType,
                normalizedSearchTerm,
              );
              searchCache.set(searchType, normalizedSearchTerm, fallbackResult);
              const elapsed = Date.now() - startTime;
              console.log(
                `subscription_search: Profile search completed in ${elapsed}ms (fallback)`,
              );
              return fallbackResult;
            }
          } catch (fallbackError) {
            console.error(
              "subscription_search: Fallback search failed:",
              fallbackError,
            );
          }

          console.log(
            "subscription_search: Profile not found in any relays, returning empty result",
          );
          const emptyResult = createEmptySearchResult(
            searchType,
            normalizedSearchTerm,
          );
          // AI-NOTE: 2025-01-08 - Don't cache empty profile results as they may be due to search issues
          // rather than the profile not existing
          const elapsed = Date.now() - startTime;
          console.log(
            `subscription_search: Profile search completed in ${elapsed}ms (not found)`,
          );
          return emptyResult;
        } else {
          console.log(
            "subscription_search: No results from primary relay, continuing to Phase 2",
          );
        }
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
    ndk,
    callbacks,
    cleanup,
  );

  // AI-NOTE: 2025-01-08 - Log performance for non-profile searches
  if (searchType !== "n") {
    const elapsed = Date.now() - startTime;
    console.log(
      `subscription_search: ${searchType} search completed in ${elapsed}ms`,
    );
  }

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
    foundProfiles: [] as NDKEvent[],
    isCompleted: false,
    currentSubscription: null as any,
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
  ndk: NDK,
): Promise<SearchFilter> {
  console.log("subscription_search: Creating search filter for:", {
    searchType,
    normalizedSearchTerm,
  });

  switch (searchType) {
    case "d": {
      const dFilter = {
        filter: {
          "#d": [normalizedSearchTerm],
          limit: SEARCH_LIMITS.GENERAL_CONTENT,
        },
        subscriptionType: "d-tag",
      };
      console.log("subscription_search: Created d-tag filter:", dFilter);
      return dFilter;
    }
    case "t": {
      const tFilter = {
        filter: {
          "#t": [normalizedSearchTerm],
          limit: SEARCH_LIMITS.GENERAL_CONTENT,
        },
        subscriptionType: "t-tag",
      };
      console.log("subscription_search: Created t-tag filter:", tFilter);
      return tFilter;
    }
    case "n": {
      // AI-NOTE: 2025-01-24 - Use the existing profile search functionality
      // This properly handles NIP-05 lookups and name searches
      const { searchProfiles } = await import("./profile_search.ts");
      const profileResult = await searchProfiles(normalizedSearchTerm, ndk);
      
      // Convert profile results to events for compatibility
      const events = profileResult.profiles.map((profile) => {
        const event = new NDKEvent(ndk);
        event.content = JSON.stringify(profile);
        
        // AI-NOTE: 2025-01-24 - Convert npub to hex public key for compatibility with nprofileEncode
        // The profile.pubkey is an npub (bech32-encoded), but nprofileEncode expects hex-encoded public key
        let hexPubkey = profile.pubkey || "";
        if (profile.pubkey && profile.pubkey.startsWith("npub")) {
          try {
            const decoded = nip19.decode(profile.pubkey);
            if (decoded.type === "npub") {
              hexPubkey = decoded.data as string;
            }
          } catch (e) {
            console.warn("subscription_search: Failed to decode npub:", profile.pubkey, e);
          }
        }
        event.pubkey = hexPubkey;
        event.kind = 0;
        
        // AI-NOTE: 2025-01-24 - Use the preserved created_at timestamp from the profile
        // This ensures the profile cards show the actual creation date instead of "Unknown date"
        if ((profile as any).created_at) {
          event.created_at = (profile as any).created_at;
          console.log("subscription_search: Using preserved timestamp:", event.created_at);
        } else {
          // Fallback to current timestamp if no preserved timestamp
          event.created_at = Math.floor(Date.now() / 1000);
          console.log("subscription_search: Using fallback timestamp:", event.created_at);
        }
        
        return event;
      });
      
      // Return a mock filter since we're using the profile search directly
      const nFilter = {
        filter: { kinds: [0], limit: 1 }, // Dummy filter
        subscriptionType: "profile-search",
        searchTerm: normalizedSearchTerm,
        preloadedEvents: events, // AI-NOTE: 2025-01-24 - Pass preloaded events
      };
      console.log("subscription_search: Created profile filter with preloaded events:", nFilter);
      return nFilter;
    }
    default: {
      throw new Error(`Unknown search type: ${searchType}`);
    }
  }
}



/**
 * Create primary relay set for search operations
 * AI-NOTE: 2025-01-24 - Updated to use all available relays to prevent search failures
 */
function createPrimaryRelaySet(
  searchType: SearchSubscriptionType,
  ndk: NDK,
): NDKRelaySet {
  // Debug: Log all relays in NDK pool
  const poolRelays = Array.from(ndk.pool.relays.values());
  console.debug(
    "subscription_search: NDK pool relays:",
    poolRelays.map((r: any) => r.url),
  );

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
      console.debug(
        "subscription_search: Profile search - using search relays for speed:",
        searchRelaySet.map((r: any) => r.url),
      );
      // Still include all relays for comprehensive coverage
      console.debug(
        "subscription_search: Profile search - also including all relays for comprehensive coverage",
      );
      return new NDKRelaySet(new Set(poolRelays) as any, ndk);
    } else {
      // Use all relays if search relays not available
      console.debug(
        "subscription_search: Profile search - using all relays:",
        poolRelays.map((r: any) => r.url),
      );
      return new NDKRelaySet(new Set(poolRelays) as any, ndk);
    }
  } else {
    // For all other searches, use ALL available relays for maximum coverage
    const activeRelays = [
      ...get(activeInboxRelays),
      ...get(activeOutboxRelays),
    ];
    console.debug("subscription_search: Active relay stores:", {
      inboxRelays: get(activeInboxRelays),
      outboxRelays: get(activeOutboxRelays),
      activeRelays,
    });

    // AI-NOTE: 2025-01-24 - Use all pool relays instead of filtering to active relays only
    // This ensures we don't miss events that might be on other relays
    console.debug(
      "subscription_search: Using ALL pool relays for comprehensive search coverage:",
      poolRelays.map((r: any) => r.url),
    );
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
        processProfileEvent(
          event,
          subscriptionType,
          normalizedSearchTerm,
          searchState,
        );
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
    "profiles:",
    searchState.foundProfiles.length,
    "tTag:",
    searchState.tTagEvents.length,
  );
}

/**
 * Process profile event
 */
function processProfileEvent(
  event: NDKEvent,
  subscriptionType: string,
  normalizedSearchTerm: string,
  searchState: any,
) {
  if (!event.content) return;

  // If this is a specific npub search, NIP-05 found search, or profile-search, include all matching events
  if (
    subscriptionType === "npub-specific" ||
    subscriptionType === "nip05-found" ||
    subscriptionType === "profile-search"
  ) {
    searchState.foundProfiles.push(event);
    return;
  }

  // For general profile searches, filter by content
  const profileData = JSON.parse(event.content);
  const displayName = profileData.display_name || profileData.displayName || "";
  const name = profileData.name || "";
  const nip05 = profileData.nip05 || "";
  const username = profileData.username || "";
  const about = profileData.about || "";
  const bio = profileData.bio || "";
  const description = profileData.description || "";

  const matchesDisplayName = fieldMatches(displayName, normalizedSearchTerm);
  const matchesName = fieldMatches(name, normalizedSearchTerm);
  const matchesNip05 = nip05Matches(nip05, normalizedSearchTerm);
  const matchesUsername = fieldMatches(username, normalizedSearchTerm);
  const matchesAbout = fieldMatches(about, normalizedSearchTerm);
  const matchesBio = fieldMatches(bio, normalizedSearchTerm);
  const matchesDescription = fieldMatches(description, normalizedSearchTerm);

  if (
    matchesDisplayName ||
    matchesName ||
    matchesNip05 ||
    matchesUsername ||
    matchesAbout ||
    matchesBio ||
    matchesDescription
  ) {
    searchState.foundProfiles.push(event);
  }
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
  if (searchType === "n") {
    return searchState.foundProfiles.length > 0;
  } else if (searchType === "d") {
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
  return {
    events: searchType === "n"
      ? searchState.foundProfiles
      : searchType === "t"
      ? searchState.tTagEvents
      : searchState.firstOrderEvents,
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
  ndk: NDK,
  callbacks?: SearchCallbacks,
  cleanup?: () => void,
): Promise<SearchResult> {
  // AI-NOTE: 2025-01-24 - Use ALL available relays for comprehensive search coverage
  // This ensures we don't miss events that might be on any available relay
  const otherRelays = new NDKRelaySet(
    new Set(Array.from(ndk.pool.relays.values())),
    ndk,
  );

  console.debug(
    "subscription_search: Background search using ALL relays:",
    Array.from(ndk.pool.relays.values()).map((r: any) => r.url),
  );

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
        processProfileEvent(
          event,
          searchFilter.subscriptionType,
          searchState.normalizedSearchTerm,
          searchState,
        );
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
        ndk,
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
  ndk: NDK,
  callbacks?: SearchCallbacks,
): SearchResult {
  if (searchType === "n") {
    return processProfileEoseResults(searchState, searchFilter, ndk, callbacks);
  } else if (searchType === "d") {
    return processContentEoseResults(searchState, searchType, ndk);
  } else if (searchType === "t") {
    return processTTagEoseResults(searchState);
  }

  return createEmptySearchResult(searchType, searchState.normalizedSearchTerm);
}

/**
 * Process profile EOSE results
 */
function processProfileEoseResults(
  searchState: any,
  searchFilter: SearchFilter,
  ndk: NDK,
  callbacks?: SearchCallbacks,
): SearchResult {
  if (searchState.foundProfiles.length === 0) {
    return createEmptySearchResult("n", searchState.normalizedSearchTerm);
  }

  // Deduplicate by pubkey, keep only newest
  const deduped: Record<string, { event: NDKEvent; created_at: number }> = {};
  for (const event of searchState.foundProfiles) {
    const pubkey = event.pubkey;
    const created_at = event.created_at || 0;
    if (!deduped[pubkey] || deduped[pubkey].created_at < created_at) {
      deduped[pubkey] = { event, created_at };
    }
  }

  // Sort by creation time (newest first) and take only the most recent profiles
  const dedupedProfiles = Object.values(deduped)
    .sort((a, b) => b.created_at - a.created_at)
    .map((x) => x.event);

  // Perform second-order search for npub searches
  if (
    searchFilter.subscriptionType === "npub-specific" ||
    searchFilter.subscriptionType === "nip05-found"
  ) {
    const targetPubkey = dedupedProfiles[0]?.pubkey;
    if (targetPubkey) {
      console.log(
        "subscription_search: Triggering second-order search for npub-specific profile:",
        targetPubkey,
      );
      performSecondOrderSearchInBackground(
        "n",
        dedupedProfiles,
        new Set(),
        new Set(),
        ndk,
        targetPubkey,
        callbacks,
      );
    } else {
      console.log(
        "subscription_search: No targetPubkey found for second-order search",
      );
    }
  } else if (searchFilter.subscriptionType === "profile") {
    // For general profile searches, perform second-order search for each found profile
    for (const profile of dedupedProfiles) {
      if (profile.pubkey) {
        console.log(
          "subscription_search: Triggering second-order search for general profile:",
          profile.pubkey,
        );
        performSecondOrderSearchInBackground(
          "n",
          dedupedProfiles,
          new Set(),
          new Set(),
          ndk,
          profile.pubkey,
          callbacks,
        );
      }
    }
  } else {
    console.log(
      "subscription_search: No second-order search triggered for subscription type:",
      searchFilter.subscriptionType,
    );
  }

  return {
    events: dedupedProfiles,
    secondOrder: [],
    tTagEvents: [],
    eventIds: new Set(dedupedProfiles.map((p) => p.id)),
    addresses: new Set(),
    searchType: "n",
    searchTerm: searchState.normalizedSearchTerm,
  };
}

/**
 * Process content EOSE results
 */
function processContentEoseResults(
  searchState: any,
  searchType: SearchSubscriptionType,
  ndk: NDK,
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
      ndk,
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
  ndk: NDK,
  targetPubkey?: string,
  callbacks?: SearchCallbacks,
) {
  try {
    console.log(
      "subscription_search: Starting second-order search for",
      searchType,
      "with targetPubkey:",
      targetPubkey,
    );
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
        console.log(
          "subscription_search: Searching for events mentioning pubkey:",
          targetPubkey,
        );

        // AI-NOTE: 2025-01-24 - Use only active relays for second-order profile search to prevent hanging
        const activeRelays = [
          ...get(activeInboxRelays),
          ...get(activeOutboxRelays),
        ];
        const availableRelays = activeRelays
          .map((url) => ndk.pool.relays.get(url))
          .filter((relay): relay is any => relay !== undefined);
        const relaySet = new NDKRelaySet(
          new Set(availableRelays),
          ndk,
        );

        console.log(
          "subscription_search: Using",
          activeRelays.length,
          "active relays for second-order search",
        );

        // Search for events that mention this pubkey via p-tags
        const pTagFilter = { "#p": [targetPubkey], limit: 50 }; // AI-NOTE: 2025-01-24 - Limit results to prevent hanging
        const pTagEvents = await ndk.fetchEvents(
          pTagFilter,
          { closeOnEose: true },
          relaySet,
        );
        console.log(
          "subscription_search: Found",
          pTagEvents.size,
          "events with p-tag for",
          targetPubkey,
        );

        // AI-NOTE: 2025-01-24 - Also search for events written by this pubkey with limit
        const authorFilter = { authors: [targetPubkey], limit: 50 }; // AI-NOTE: 2025-01-24 - Limit results to prevent hanging
        const authorEvents = await ndk.fetchEvents(
          authorFilter,
          { closeOnEose: true },
          relaySet,
        );
        console.log(
          "subscription_search: Found",
          authorEvents.size,
          "events written by",
          targetPubkey,
        );

        // Filter out unwanted events from both sets
        const filteredPTagEvents = filterUnwantedEvents(Array.from(pTagEvents));
        const filteredAuthorEvents = filterUnwantedEvents(
          Array.from(authorEvents),
        );

        console.log(
          "subscription_search: After filtering unwanted events:",
          filteredPTagEvents.length,
          "p-tag events,",
          filteredAuthorEvents.length,
          "author events",
        );

        // Combine both sets of events
        allSecondOrderEvents = [...filteredPTagEvents, ...filteredAuthorEvents];
      } else if (searchType === "d") {
        // Parallel fetch for #e and #a tag events
        const relaySet = new NDKRelaySet(
          new Set(Array.from(ndk.pool.relays.values())),
          ndk,
        );
        const [eTagEvents, aTagEvents] = await Promise.all([
          eventIds.size > 0
            ? ndk.fetchEvents(
              {
                "#e": Array.from(eventIds),
                limit: SEARCH_LIMITS.SECOND_ORDER_RESULTS,
              },
              { closeOnEose: true },
              relaySet,
            )
            : Promise.resolve([]),
          addresses.size > 0
            ? ndk.fetchEvents(
              {
                "#a": Array.from(addresses),
                limit: SEARCH_LIMITS.SECOND_ORDER_RESULTS,
              },
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

      console.log(
        "subscription_search: Second-order search completed with",
        sortedSecondOrder.length,
        "results",
      );

      // Update the search results with second-order events
      const result: SearchResult = {
        events: firstOrderEvents,
        secondOrder: sortedSecondOrder,
        tTagEvents: [],
        eventIds: searchType === "n"
          ? new Set(firstOrderEvents.map((p) => p.id))
          : eventIds,
        addresses: searchType === "n" ? new Set() : addresses,
        searchType: searchType,
        searchTerm: "", // This will be set by the caller
      };

      // Notify UI of updated results
      if (callbacks?.onSecondOrderUpdate) {
        console.log(
          "subscription_search: Calling onSecondOrderUpdate callback with",
          sortedSecondOrder.length,
          "second-order events",
        );
        callbacks.onSecondOrderUpdate(result);
      } else {
        console.log(
          "subscription_search: No onSecondOrderUpdate callback available",
        );
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
