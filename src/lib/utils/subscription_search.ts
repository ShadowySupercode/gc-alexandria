// deno-lint-ignore-file no-explicit-any
import { ndkInstance } from "../ndk.ts";
import { getMatchingTags, getNpubFromNip05 } from "./nostrUtils.ts";
import { nip19 } from "./nostrUtils.ts";
import { NDKRelaySet, NDKEvent } from "@nostr-dev-kit/ndk";
import { searchCache } from "./searchCache.ts";
import { communityRelays, searchRelays } from "../consts.ts";
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
  COMMON_DOMAINS,
  isEmojiReaction,
} from "./search_utils.ts";
import { TIMEOUTS, SEARCH_LIMITS } from "./search_constants.ts";
import { activeInboxRelays, activeOutboxRelays } from "../ndk.ts";

// Helper function to normalize URLs for comparison
const normalizeUrl = (url: string): string => {
  return url.replace(/\/$/, ''); // Remove trailing slash
};

/**
 * Search for events by subscription type (d, t, n)
 */
export async function searchBySubscription(
  searchType: SearchSubscriptionType,
  searchTerm: string,
  callbacks?: SearchCallbacks,
  abortSignal?: AbortSignal,
): Promise<SearchResult> {
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

  // Set a timeout to force completion after subscription search timeout
  searchState.timeoutId = setTimeout(() => {
    console.log("subscription_search: Search timeout reached");
    cleanup();
  }, TIMEOUTS.SUBSCRIPTION_SEARCH);

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
  return searchOtherRelaysInBackground(
    searchType,
    searchFilter,
    searchState,
    callbacks,
    cleanup,
  );
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
): Promise<SearchFilter> {
  console.log("subscription_search: Creating search filter for:", {
    searchType,
    normalizedSearchTerm,
  });

  switch (searchType) {
    case "d": {
      const dFilter = {
        filter: { "#d": [normalizedSearchTerm] },
        subscriptionType: "d-tag",
      };
      console.log("subscription_search: Created d-tag filter:", dFilter);
      return dFilter;
    }
    case "t": {
      const tFilter = {
        filter: { "#t": [normalizedSearchTerm] },
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
 */
async function createProfileSearchFilter(
  normalizedSearchTerm: string,
): Promise<SearchFilter> {
  // For npub searches, try to decode the search term first
  try {
    const decoded = nip19.decode(normalizedSearchTerm);
    if (decoded && decoded.type === "npub") {
      return {
        filter: {
          kinds: [0],
          authors: [decoded.data],
          limit: SEARCH_LIMITS.SPECIFIC_PROFILE,
        },
        subscriptionType: "npub-specific",
      };
    }
  } catch {
    // Not a valid npub, continue with other strategies
  }

  // Try NIP-05 lookup first
  try {
    for (const domain of COMMON_DOMAINS) {
      const nip05Address = `${normalizedSearchTerm}@${domain}`;
      try {
        const npub = await getNpubFromNip05(nip05Address);
        if (npub) {
          return {
            filter: {
              kinds: [0],
              authors: [npub],
              limit: SEARCH_LIMITS.SPECIFIC_PROFILE,
            },
            subscriptionType: "nip05-found",
          };
        }
      } catch {
        // Continue to next domain
      }
    }
  } catch {
    // Fallback to reasonable profile search
  }

  return {
    filter: { kinds: [0], limit: SEARCH_LIMITS.GENERAL_PROFILE },
    subscriptionType: "profile",
  };
}

/**
 * Create primary relay set based on search type
 */
function createPrimaryRelaySet(
  searchType: SearchSubscriptionType,
  ndk: any,
): NDKRelaySet {
  // Use the new relay management system
  const searchRelays = [...get(activeInboxRelays), ...get(activeOutboxRelays)];
  console.debug('subscription_search: Active relay stores:', {
    inboxRelays: get(activeInboxRelays),
    outboxRelays: get(activeOutboxRelays),
    searchRelays
  });
  
  // Debug: Log all relays in NDK pool
  const poolRelays = Array.from(ndk.pool.relays.values());
  console.debug('subscription_search: NDK pool relays:', poolRelays.map((r: any) => r.url));
  
  if (searchType === "n") {
    // For profile searches, use search relays first
    const profileRelaySet = poolRelays.filter(
      (relay: any) =>
        searchRelays.some(
          (searchRelay: string) =>
            normalizeUrl(relay.url) === normalizeUrl(searchRelay),
        ),
    );
    console.debug('subscription_search: Profile relay set:', profileRelaySet.map((r: any) => r.url));
    return new NDKRelaySet(new Set(profileRelaySet) as any, ndk);
  } else {
    // For other searches, use active relays first
    const activeRelaySet = poolRelays.filter(
      (relay: any) =>
        searchRelays.some(
          (searchRelay: string) =>
            normalizeUrl(relay.url) === normalizeUrl(searchRelay),
        ),
    );
    console.debug('subscription_search: Active relay set:', activeRelaySet.map((r: any) => r.url));
    return new NDKRelaySet(new Set(activeRelaySet) as any, ndk);
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

  // If this is a specific npub search or NIP-05 found search, include all matching events
  if (
    subscriptionType === "npub-specific" ||
    subscriptionType === "nip05-found"
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
  callbacks?: SearchCallbacks,
  cleanup?: () => void,
): Promise<SearchResult> {
  const ndk = get(ndkInstance);

  const otherRelays = new NDKRelaySet(
    new Set(
      Array.from(ndk.pool.relays.values()).filter((relay: any) => {
        if (searchType === "n") {
          // For profile searches, exclude search relays from fallback search
          return !searchRelays.some(
            (searchRelay: string) =>
              normalizeUrl(relay.url) === normalizeUrl(searchRelay),
          );
        } else {
          // For other searches, exclude community relays from fallback search
          return !communityRelays.some(
            (communityRelay: string) =>
              normalizeUrl(relay.url) === normalizeUrl(communityRelay),
          );
        }
      }),
    ),
    ndk,
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
  if (searchType === "n") {
    return processProfileEoseResults(searchState, searchFilter, callbacks);
  } else if (searchType === "d") {
    return processContentEoseResults(searchState, searchType);
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
      performSecondOrderSearchInBackground(
        "n",
        dedupedProfiles,
        new Set(),
        new Set(),
        targetPubkey,
        callbacks,
      );
    }
  } else if (searchFilter.subscriptionType === "profile") {
    // For general profile searches, perform second-order search for each found profile
    for (const profile of dedupedProfiles) {
      if (profile.pubkey) {
        performSecondOrderSearchInBackground(
          "n",
          dedupedProfiles,
          new Set(),
          new Set(),
          profile.pubkey,
          callbacks,
        );
      }
    }
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
        // Search for events that mention this pubkey via p-tags
        const pTagFilter = { "#p": [targetPubkey] };
        const pTagEvents = await ndk.fetchEvents(
          pTagFilter,
          { closeOnEose: true },
          new NDKRelaySet(new Set(Array.from(ndk.pool.relays.values())), ndk),
        );
        // Filter out emoji reactions
        const filteredEvents = Array.from(pTagEvents).filter(
          (event) => !isEmojiReaction(event),
        );
        allSecondOrderEvents = [...allSecondOrderEvents, ...filteredEvents];
      } else if (searchType === "d") {
        // Parallel fetch for #e and #a tag events
        const relaySet = new NDKRelaySet(
          new Set(Array.from(ndk.pool.relays.values())),
          ndk,
        );
        const [eTagEvents, aTagEvents] = await Promise.all([
          eventIds.size > 0
            ? ndk.fetchEvents(
                { "#e": Array.from(eventIds) },
                { closeOnEose: true },
                relaySet,
              )
            : Promise.resolve([]),
          addresses.size > 0
            ? ndk.fetchEvents(
                { "#a": Array.from(addresses) },
                { closeOnEose: true },
                relaySet,
              )
            : Promise.resolve([]),
        ]);
        // Filter out emoji reactions
        const filteredETagEvents = Array.from(eTagEvents).filter(
          (event) => !isEmojiReaction(event),
        );
        const filteredATagEvents = Array.from(aTagEvents).filter(
          (event) => !isEmojiReaction(event),
        );
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
        callbacks.onSecondOrderUpdate(result);
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
