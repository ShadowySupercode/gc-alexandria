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

// AI-NOTE:  Define prioritized event kinds for subscription search
const PRIORITIZED_EVENT_KINDS = new Set([
  1, // Text notes
  1111, // Comments
  9802, // Highlights
  20, // Article
  21, // Article
  22, // Article
  1222, // Long-form content
  1244, // Long-form content
  30023, // Long-form content
  30040, // Long-form content
  30041, // Long-form content
]);

/**
 * Prioritize events for subscription search results
 * @param events Array of events to prioritize
 * @param targetPubkey The pubkey being searched for (for n: searches only - events from this pubkey get highest priority)
 * @param maxResults Maximum number of results to return
 * @param ndk NDK instance for user list and community checks
 * @returns Prioritized array of events
 *
 * Priority tiers:
 * 1. Prioritized event kinds (1, 1111, 9802, 20, 21, 22, 1222, 1244, 30023, 30040, 30041) + target pubkey events (n: searches only)
 * 2. Events from user's follows (if logged in)
 * 3. Events from community members
 * 4. All other events
 */
async function prioritizeSearchEvents(
  events: NDKEvent[],
  targetPubkey?: string,
  maxResults: number = SEARCH_LIMITS.GENERAL_CONTENT,
  ndk?: NDK,
): Promise<NDKEvent[]> {
  if (events.length === 0) {
    return [];
  }

  // AI-NOTE:  Get user lists and community status for prioritization
  let userFollowPubkeys = new Set<string>();
  let communityMemberPubkeys = new Set<string>();

  // Only attempt user list and community checks if NDK is provided
  if (ndk) {
    try {
      // Import user list functions dynamically to avoid circular dependencies
      const { fetchCurrentUserLists, getPubkeysFromListKind } = await import(
        "./user_lists.ts"
      );
      const { checkCommunity } = await import("./community_checker.ts");

      // Get current user's follow lists (if logged in)
      const userLists = await fetchCurrentUserLists(undefined, ndk);
      userFollowPubkeys = getPubkeysFromListKind(userLists, 3); // Kind 3 = follow list

      // Check community status for unique pubkeys in events (limit to prevent hanging)
      const uniquePubkeys = new Set(
        events.map((e) => e.pubkey).filter(Boolean),
      );
      const pubkeysToCheck = Array.from(uniquePubkeys).slice(0, 20); // Limit to first 20 pubkeys

      console.log(
        `subscription_search: Checking community status for ${pubkeysToCheck.length} pubkeys out of ${uniquePubkeys.size} total`,
      );

      const communityChecks = await Promise.allSettled(
        pubkeysToCheck.map(async (pubkey) => {
          try {
            const isCommunityMember = await Promise.race([
              checkCommunity(pubkey),
              new Promise((_, reject) =>
                setTimeout(
                  () => reject(new Error("Community check timeout")),
                  2000,
                ),
              ),
            ]);
            return { pubkey, isCommunityMember };
          } catch (error) {
            console.warn(
              `subscription_search: Community check failed for ${pubkey}:`,
              error,
            );
            return { pubkey, isCommunityMember: false };
          }
        }),
      );

      // Build set of community member pubkeys
      communityChecks.forEach((result) => {
        if (result.status === "fulfilled" && result.value.isCommunityMember) {
          communityMemberPubkeys.add(result.value.pubkey);
        }
      });

      console.log("subscription_search: Prioritization data loaded:", {
        userFollows: userFollowPubkeys.size,
        communityMembers: communityMemberPubkeys.size,
        totalEvents: events.length,
      });
    } catch (error) {
      console.warn(
        "subscription_search: Failed to load prioritization data:",
        error,
      );
    }
  } else {
    console.log(
      "subscription_search: No NDK provided, skipping user list and community checks",
    );
  }

  // Separate events into priority tiers
  const tier1: NDKEvent[] = []; // Events from target pubkey (n: searches only) + prioritized kinds
  const tier2: NDKEvent[] = []; // Events from user's follows
  const tier3: NDKEvent[] = []; // Events from community members
  const tier4: NDKEvent[] = []; // All other events

  for (const event of events) {
    const isFromTarget = targetPubkey && event.pubkey === targetPubkey;
    const isPrioritizedKind = PRIORITIZED_EVENT_KINDS.has(event.kind || 0);
    const isFromFollow = userFollowPubkeys.has(event.pubkey || "");
    const isFromCommunityMember = communityMemberPubkeys.has(
      event.pubkey || "",
    );

    // AI-NOTE:  Prioritized kinds are always in tier 1
    // Target pubkey priority only applies to n: searches (when targetPubkey is provided)
    if (isPrioritizedKind || isFromTarget) {
      tier1.push(event);
    } else if (isFromFollow) {
      tier2.push(event);
    } else if (isFromCommunityMember) {
      tier3.push(event);
    } else {
      tier4.push(event);
    }
  }

  // Sort each tier by creation time (newest first)
  tier1.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  tier2.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  tier3.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  tier4.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

  // Combine tiers in priority order, respecting the limit
  const result: NDKEvent[] = [];

  // Add tier 1 events (highest priority)
  result.push(...tier1);

  // Add tier 2 events (follows) if we haven't reached the limit
  const remainingAfterTier1 = maxResults - result.length;
  if (remainingAfterTier1 > 0) {
    result.push(...tier2.slice(0, remainingAfterTier1));
  }

  // Add tier 3 events (community members) if we haven't reached the limit
  const remainingAfterTier2 = maxResults - result.length;
  if (remainingAfterTier2 > 0) {
    result.push(...tier3.slice(0, remainingAfterTier2));
  }

  // Add tier 4 events (others) if we haven't reached the limit
  const remainingAfterTier3 = maxResults - result.length;
  if (remainingAfterTier3 > 0) {
    result.push(...tier4.slice(0, remainingAfterTier3));
  }

  console.log("subscription_search: Event prioritization complete:", {
    tier1: tier1.length, // Prioritized kinds + target pubkey (n: searches only)
    tier2: tier2.length, // User follows
    tier3: tier3.length, // Community members
    tier4: tier4.length, // Others
    total: result.length,
  });

  return result;
}

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
  const startTime = Date.now(); // AI-NOTE:  Track search performance
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

    // AI-NOTE:  Ensure cached events have created_at property preserved
    // This fixes the "Unknown date" issue when events are retrieved from cache
    const eventsWithCreatedAt = cachedResult.events.map((event) => {
      if (event && typeof event === "object" && !event.created_at) {
        console.warn(
          "subscription_search: Event missing created_at, setting to 0:",
          event.id,
        );
        (event as any).created_at = 0;
      }
      return event;
    });

    const secondOrderWithCreatedAt = cachedResult.secondOrder.map((event) => {
      if (event && typeof event === "object" && !event.created_at) {
        console.warn(
          "subscription_search: Second order event missing created_at, setting to 0:",
          event.id,
        );
        (event as any).created_at = 0;
      }
      return event;
    });

    const tTagEventsWithCreatedAt = cachedResult.tTagEvents.map((event) => {
      if (event && typeof event === "object" && !event.created_at) {
        console.warn(
          "subscription_search: T-tag event missing created_at, setting to 0:",
          event.id,
        );
        (event as any).created_at = 0;
      }
      return event;
    });

    const resultWithCreatedAt = {
      ...cachedResult,
      events: eventsWithCreatedAt,
      secondOrder: secondOrderWithCreatedAt,
      tTagEvents: tTagEventsWithCreatedAt,
    };

    // AI-NOTE:  Return cached results immediately but trigger second-order search in background
    // This ensures we get fast results while still updating second-order data
    console.log(
      "subscription_search: Returning cached result immediately, triggering background second-order search",
    );

    // Trigger second-order search in background for all search types
    if (ndk) {
      // Start second-order search in background for n and d searches only
      if (searchType === "n" || searchType === "d") {
        console.log(
          "subscription_search: Triggering background second-order search for cached result",
        );
        performSecondOrderSearchInBackground(
          searchType as "n" | "d",
          eventsWithCreatedAt,
          cachedResult.eventIds || new Set(),
          cachedResult.addresses || new Set(),
          ndk,
          searchType === "n" ? eventsWithCreatedAt[0]?.pubkey : undefined,
          callbacks,
        );
      }
    }

    return resultWithCreatedAt;
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
  }, TIMEOUTS.SUBSCRIPTION_SEARCH); // AI-NOTE:  Use standard timeout since cache is checked first

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

  // AI-NOTE:  Check for preloaded events first (for profile searches)
  if (searchFilter.preloadedEvents && searchFilter.preloadedEvents.length > 0) {
    console.log(
      "subscription_search: Using preloaded events:",
      searchFilter.preloadedEvents.length,
    );
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
      console.log(
        "subscription_search: Found results from preloaded events, returning immediately",
      );
      const immediateResult = createSearchResult(
        searchState,
        searchType,
        normalizedSearchTerm,
      );
      searchCache.set(searchType, normalizedSearchTerm, immediateResult);

      // AI-NOTE:  For profile searches, start background second-order search even for preloaded events
      if (searchType === "n") {
        console.log(
          "subscription_search: Profile found from preloaded events, starting background second-order search",
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

        // Clear the main timeout since we're returning early
        cleanup();
      }

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

      // Add timeout to primary relay search
      const primaryEventsPromise = ndk.fetchEvents(
        searchFilter.filter,
        { closeOnEose: true },
        primaryRelaySet,
      );

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error("Primary relay search timeout")),
          TIMEOUTS.SUBSCRIPTION_SEARCH,
        );
      });

      const primaryEvents = (await Promise.race([
        primaryEventsPromise,
        timeoutPromise,
      ])) as any;

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

        // AI-NOTE:  For profile searches, return immediately when found
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

          // Clear the main timeout since we're returning early
          cleanup();
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

        // Clear the main timeout since we're returning early
        cleanup();
        return immediateResult;
      } else {
        console.log("subscription_search: No results from primary relay");

        // AI-NOTE:  For profile searches, if no results found in search relays,
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
            // Add timeout to fallback search
            const fallbackEventsPromise = ndk.fetchEvents(
              searchFilter.filter,
              { closeOnEose: true },
              allRelaySet,
            );

            const fallbackTimeoutPromise = new Promise((_, reject) => {
              setTimeout(
                () => reject(new Error("Fallback search timeout")),
                TIMEOUTS.SUBSCRIPTION_SEARCH,
              );
            });

            const fallbackEvents = (await Promise.race([
              fallbackEventsPromise,
              fallbackTimeoutPromise,
            ])) as any;

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

              // Clear the main timeout since we're returning early
              cleanup();
              return fallbackResult;
            }
          } catch (fallbackError) {
            console.error(
              "subscription_search: Fallback search failed:",
              fallbackError,
            );

            // If it's a timeout error, continue to return empty result
            if (
              fallbackError instanceof Error &&
              fallbackError.message.includes("timeout")
            ) {
              console.log(
                "subscription_search: Fallback search timed out, returning empty result",
              );
            }
          }

          console.log(
            "subscription_search: Profile not found in any relays, returning empty result",
          );
          const emptyResult = createEmptySearchResult(
            searchType,
            normalizedSearchTerm,
          );
          // AI-NOTE:  Don't cache empty profile results as they may be due to search issues
          // rather than the profile not existing
          const elapsed = Date.now() - startTime;
          console.log(
            `subscription_search: Profile search completed in ${elapsed}ms (not found)`,
          );

          // Clear the main timeout since we're returning early
          cleanup();
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

      // If it's a timeout error, continue to Phase 2 instead of failing
      if (error instanceof Error && error.message.includes("timeout")) {
        console.log(
          "subscription_search: Primary relay search timed out, continuing to Phase 2",
        );
      } else {
        // For other errors, we might want to fail the search
        throw error;
      }
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

  // AI-NOTE:  Log performance for non-profile searches
  if (searchType !== "n") {
    const elapsed = Date.now() - startTime;
    console.log(
      `subscription_search: ${searchType} search completed in ${elapsed}ms`,
    );
  }

  // Clear the main timeout since we're completing normally
  cleanup();
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
      // AI-NOTE:  Use the existing profile search functionality
      // This properly handles NIP-05 lookups and name searches
      const { searchProfiles } = await import("./profile_search.ts");
      const profileResult = await searchProfiles(normalizedSearchTerm, ndk);

      // Convert profile results to events for compatibility
      const events = profileResult.profiles.map((profile) => {
        const event = new NDKEvent(ndk);
        event.content = JSON.stringify(profile);

        // AI-NOTE:  Convert npub to hex public key for compatibility with nprofileEncode
        // The profile.pubkey is an npub (bech32-encoded), but nprofileEncode expects hex-encoded public key
        let hexPubkey = profile.pubkey || "";
        if (profile.pubkey && profile.pubkey.startsWith("npub")) {
          try {
            const decoded = nip19.decode(profile.pubkey);
            if (decoded.type === "npub") {
              hexPubkey = decoded.data as string;
            }
          } catch (e) {
            console.warn(
              "subscription_search: Failed to decode npub:",
              profile.pubkey,
              e,
            );
          }
        }
        event.pubkey = hexPubkey;
        event.kind = 0;

        // AI-NOTE:  Use the preserved created_at timestamp from the profile
        // This ensures the profile cards show the actual creation date instead of "Unknown date"
        if ((profile as any).created_at) {
          event.created_at = (profile as any).created_at;
          console.log(
            "subscription_search: Using preserved timestamp:",
            event.created_at,
          );
        } else {
          // Fallback to current timestamp if no preserved timestamp
          event.created_at = Math.floor(Date.now() / 1000);
          console.log(
            "subscription_search: Using fallback timestamp:",
            event.created_at,
          );
        }

        return event;
      });

      // Return a mock filter since we're using the profile search directly
      const nFilter = {
        filter: { kinds: [0], limit: 1 }, // Dummy filter
        subscriptionType: "profile-search",
        searchTerm: normalizedSearchTerm,
        preloadedEvents: events, // AI-NOTE:  Pass preloaded events
      };
      console.log(
        "subscription_search: Created profile filter with preloaded events:",
        nFilter,
      );
      return nFilter;
    }
    default: {
      throw new Error(`Unknown search type: ${searchType}`);
    }
  }
}

/**
 * Create primary relay set for search operations
 * AI-NOTE:  Updated to use all available relays to prevent search failures
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

  // AI-NOTE:  Use ALL available relays for comprehensive search coverage
  // This ensures searches don't fail due to missing relays and provides maximum event discovery

  if (searchType === "n") {
    // For profile searches, prioritize search relays for speed but include all relays
    const searchRelaySet = poolRelays.filter((relay: any) =>
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

    // AI-NOTE:  Use all pool relays instead of filtering to active relays only
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

  // AI-NOTE: Apply subscription fetch limit to primary relay results
  const maxEvents = SEARCH_LIMITS.SUBSCRIPTION_FETCH_LIMIT;
  let processedCount = 0;

  for (const event of events) {
    // Check if we've reached the event limit
    if (processedCount >= maxEvents) {
      console.log(
        `subscription_search: Reached event limit of ${maxEvents} in primary relay processing`,
      );
      break;
    }

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
      processedCount++;
    } catch (e) {
      console.warn("subscription_search: Error processing event:", e);
      // Invalid JSON or other error, skip
    }
  }

  console.log(
    `subscription_search: Processed ${processedCount} events (limit: ${maxEvents}) - firstOrder:`,
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
    events:
      searchType === "n"
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
  // AI-NOTE:  Use ALL available relays for comprehensive search coverage
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

  // AI-NOTE: Track event count to enforce subscription fetch limit
  let eventCount = 0;
  const maxEvents = SEARCH_LIMITS.SUBSCRIPTION_FETCH_LIMIT;

  sub.on("event", (event: NDKEvent) => {
    // Check if we've reached the event limit
    if (eventCount >= maxEvents) {
      console.log(
        `subscription_search: Reached event limit of ${maxEvents}, stopping event processing`,
      );
      sub.stop();
      return;
    }

    eventCount++;

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
    let resolved = false;

    // Add timeout to prevent hanging
    const timeoutId = setTimeout(async () => {
      if (!resolved) {
        console.log(
          "subscription_search: Background search timeout, resolving with current results",
        );
        resolved = true;
        sub.stop();
        const result = await processEoseResults(
          searchType,
          searchState,
          searchFilter,
          ndk,
          callbacks,
        );
        searchCache.set(searchType, searchState.normalizedSearchTerm, result);
        cleanup?.();
        resolve(result);
      }
    }, TIMEOUTS.SUBSCRIPTION_SEARCH);

    sub.on("eose", async () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeoutId);
        const result = await processEoseResults(
          searchType,
          searchState,
          searchFilter,
          ndk,
          callbacks,
        );
        searchCache.set(searchType, searchState.normalizedSearchTerm, result);
        cleanup?.();
        resolve(result);
      }
    });
  });
}

/**
 * Process EOSE results
 */
async function processEoseResults(
  searchType: SearchSubscriptionType,
  searchState: any,
  searchFilter: SearchFilter,
  ndk: NDK,
  callbacks?: SearchCallbacks,
): Promise<SearchResult> {
  if (searchType === "n") {
    return processProfileEoseResults(searchState, searchFilter, ndk, callbacks);
  } else if (searchType === "d") {
    return await processContentEoseResults(
      searchState,
      searchType,
      ndk,
      callbacks,
    );
  } else if (searchType === "t") {
    return await processTTagEoseResults(searchState, ndk);
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

  // AI-NOTE:  For profile searches, we don't apply prioritization to the profiles themselves
  // since they are all kind 0 events and should be shown in chronological order
  // However, we do pass the target pubkey to the second-order search for prioritization

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
async function processContentEoseResults(
  searchState: any,
  searchType: SearchSubscriptionType,
  ndk: NDK,
  callbacks?: SearchCallbacks,
): Promise<SearchResult> {
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

  // AI-NOTE:  Apply prioritization to first-order events for d-tag searches
  // For d-tag searches, we don't have a specific target pubkey, so we only prioritize by event kind
  const prioritizedEvents = await prioritizeSearchEvents(
    dedupedEvents,
    undefined, // No specific target pubkey for d-tag searches
    SEARCH_LIMITS.GENERAL_CONTENT,
    ndk,
  );

  // AI-NOTE:  Attach profile data to first-order events for display
  // This ensures profile pictures and other metadata are available in the UI
  await attachProfileDataToEvents(prioritizedEvents, ndk);

  // Perform second-order search for d-tag searches
  if (dedupedEvents.length > 0) {
    performSecondOrderSearchInBackground(
      "d",
      dedupedEvents,
      searchState.eventIds,
      searchState.eventAddresses,
      ndk,
      undefined, // targetPubkey not needed for d-tag searches
      callbacks,
    );
  }

  return {
    events: prioritizedEvents,
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
async function processTTagEoseResults(
  searchState: any,
  ndk?: NDK,
): Promise<SearchResult> {
  if (searchState.tTagEvents.length === 0) {
    return createEmptySearchResult("t", searchState.normalizedSearchTerm);
  }

  // AI-NOTE:  Apply prioritization to t-tag search results
  // For t-tag searches, we don't have a specific target pubkey, so we only prioritize by event kind
  const prioritizedEvents = await prioritizeSearchEvents(
    searchState.tTagEvents,
    undefined, // No specific target pubkey for t-tag searches
    SEARCH_LIMITS.GENERAL_CONTENT,
    ndk,
  );

  // AI-NOTE:  Attach profile data to t-tag events for display
  // This ensures profile pictures and other metadata are available in the UI
  if (ndk) {
    await attachProfileDataToEvents(prioritizedEvents, ndk);
  }

  return {
    events: prioritizedEvents,
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

    // Set a timeout for the initial event fetching only
    const fetchTimeoutPromise = new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error("Second-order search fetch timeout")),
        TIMEOUTS.SECOND_ORDER_SEARCH,
      );
    });

    const fetchPromise = (async () => {
      if (searchType === "n" && targetPubkey) {
        console.log(
          "subscription_search: Searching for events mentioning pubkey:",
          targetPubkey,
        );

        // AI-NOTE:  Use all available relays for second-order search to maximize results
        const relaySet = new NDKRelaySet(
          new Set(Array.from(ndk.pool.relays.values())),
          ndk,
        );

        console.log(
          "subscription_search: Using",
          ndk.pool.relays.size,
          "relays for second-order search",
        );

        // Search for events that mention this pubkey via p-tags
        const pTagFilter = { "#p": [targetPubkey], limit: 50 }; // AI-NOTE:  Limit results to prevent hanging
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

        // AI-NOTE:  Also search for events written by this pubkey with limit
        const authorFilter = { authors: [targetPubkey], limit: 50 }; // AI-NOTE:  Limit results to prevent hanging
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
    })();

    // Race between fetch and timeout - only timeout the initial event fetching
    await Promise.race([fetchPromise, fetchTimeoutPromise]);

    // Now do the prioritization without timeout
    console.log(
      "subscription_search: Event fetching completed, starting prioritization...",
    );

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

    // AI-NOTE:  Apply prioritization to second-order search results with timeout
    // Prioritize events from the target pubkey and specific event kinds
    const prioritizationPromise = prioritizeSearchEvents(
      deduplicatedSecondOrder,
      targetPubkey,
      SEARCH_LIMITS.SECOND_ORDER_RESULTS,
      ndk,
    );

    const prioritizationTimeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Prioritization timeout")), 15000); // 15 second timeout
    });

    let prioritizedSecondOrder: NDKEvent[];
    try {
      prioritizedSecondOrder = (await Promise.race([
        prioritizationPromise,
        prioritizationTimeoutPromise,
      ])) as NDKEvent[];

      console.log(
        "subscription_search: Second-order search completed with",
        prioritizedSecondOrder.length,
        "prioritized results",
      );
    } catch (error) {
      console.warn(
        "subscription_search: Prioritization failed, using simple sorting:",
        error,
      );
      // Fallback to simple sorting if prioritization fails
      prioritizedSecondOrder = deduplicatedSecondOrder
        .sort((a, b) => {
          // Prioritize events from target pubkey first (for n: searches)
          if (targetPubkey) {
            const aIsTarget = a.pubkey === targetPubkey;
            const bIsTarget = b.pubkey === targetPubkey;
            if (aIsTarget && !bIsTarget) return -1;
            if (!aIsTarget && bIsTarget) return 1;
          }

          // Prioritize by event kind (for t: searches and general prioritization)
          const aIsPrioritized = PRIORITIZED_EVENT_KINDS.has(a.kind || 0);
          const bIsPrioritized = PRIORITIZED_EVENT_KINDS.has(b.kind || 0);
          if (aIsPrioritized && !bIsPrioritized) return -1;
          if (!aIsPrioritized && bIsPrioritized) return 1;

          // Then sort by creation time (newest first)
          return (b.created_at || 0) - (a.created_at || 0);
        })
        .slice(0, SEARCH_LIMITS.SECOND_ORDER_RESULTS);

      console.log(
        "subscription_search: Using fallback sorting with",
        prioritizedSecondOrder.length,
        "results",
      );
    }

    // AI-NOTE:  Attach profile data to second-order events for display
    // This ensures profile pictures and other metadata are available in the UI
    await attachProfileDataToEvents(prioritizedSecondOrder, ndk);

    // Update the search results with second-order events
    const result: SearchResult = {
      events: firstOrderEvents,
      secondOrder: prioritizedSecondOrder,
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
      console.log(
        "subscription_search: Calling onSecondOrderUpdate callback with",
        prioritizedSecondOrder.length,
        "second-order events",
      );
      callbacks.onSecondOrderUpdate(result);
    } else {
      console.log(
        "subscription_search: No onSecondOrderUpdate callback available",
      );
    }
  } catch (err) {
    console.error(
      `[Search] Error in second-order ${searchType}-tag search:`,
      err,
    );
  }
}

/**
 * Attach profile data to events for display purposes
 * This function fetches and attaches profile information to events so they can display profile pictures and other metadata
 * @param events Array of events to attach profile data to
 * @param ndk NDK instance for fetching profile data
 * @returns Promise that resolves when profile data is attached
 */
async function attachProfileDataToEvents(
  events: NDKEvent[],
  ndk: NDK,
): Promise<void> {
  if (events.length === 0) {
    return;
  }

  console.log(
    `subscription_search: Attaching profile data to ${events.length} events`,
  );

  try {
    // Import user list functions dynamically to avoid circular dependencies
    const { fetchCurrentUserLists, isPubkeyInUserLists } = await import(
      "./user_lists.ts"
    );

    // Get current user's lists for user list status
    const userLists = await fetchCurrentUserLists(undefined, ndk);

    // Get unique pubkeys from events
    const uniquePubkeys = new Set<string>();
    events.forEach((event) => {
      if (event.pubkey) {
        uniquePubkeys.add(event.pubkey);
      }
    });

    console.log(
      `subscription_search: Found ${uniquePubkeys.size} unique pubkeys to fetch profiles for`,
    );

    // Fetch profile data for each unique pubkey
    const profilePromises = Array.from(uniquePubkeys).map(async (pubkey) => {
      try {
        // Import getUserMetadata dynamically to avoid circular dependencies
        const { getUserMetadata } = await import("./nostrUtils.ts");
        const npub = await import("./nostrUtils.ts").then((m) =>
          m.toNpub(pubkey),
        );

        if (npub) {
          const profileData = await getUserMetadata(npub, ndk, true);
          if (profileData) {
            // Check if this pubkey is in user's lists
            const isInLists = isPubkeyInUserLists(pubkey, userLists);

            // Return profile data with user list status
            return {
              pubkey,
              profileData: {
                ...profileData,
                isInUserLists: isInLists,
              },
            };
          }
        }
      } catch (error) {
        console.warn(
          `subscription_search: Failed to fetch profile for ${pubkey}:`,
          error,
        );
      }
      return null;
    });

    const profileResults = await Promise.allSettled(profilePromises);

    // Create a map of pubkey to profile data
    const profileMap = new Map<string, any>();
    profileResults.forEach((result) => {
      if (result.status === "fulfilled" && result.value) {
        profileMap.set(result.value.pubkey, result.value.profileData);
      }
    });

    console.log(
      `subscription_search: Successfully fetched ${profileMap.size} profiles`,
    );

    // Attach profile data to each event
    events.forEach((event) => {
      if (event.pubkey && profileMap.has(event.pubkey)) {
        (event as any).profileData = profileMap.get(event.pubkey);
      }
    });

    console.log(`subscription_search: Profile data attachment complete`);
  } catch (error) {
    console.error("subscription_search: Error attaching profile data:", error);
  }
}
