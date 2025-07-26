import { ndkInstance, activeInboxRelays, activeOutboxRelays } from "../ndk.ts";
import { NDKEvent, NDKSubscription, NDKRelaySet } from "@nostr-dev-kit/ndk";
import type { NDKFilter } from "@nostr-dev-kit/ndk";
import type NDK from "@nostr-dev-kit/ndk";
import { WebSocketPool } from "../data_structures/websocket_pool.ts";
import { TIMEOUTS, SEARCH_LIMITS } from "./search_constants.ts";
import type { SearchResult, SearchCallbacks, SearchSubscriptionType } from "./search_types.ts";
import { userStore } from "../stores/userStore.ts";
import { get } from "svelte/store";

/**
 * Interface for search options
 */
interface SearchOptions {
  /** Maximum number of results to return */
  limit?: number;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Whether to perform second-order searches */
  enableSecondOrder?: boolean;
  /** Whether to include t-tag events in results */
  includeTTagEvents?: boolean;
}

/**
 * Default search options
 */
const DEFAULT_SEARCH_OPTIONS: Required<SearchOptions> = {
  limit: SEARCH_LIMITS.PRIMARY_SEARCH_RESULTS,
  timeout: TIMEOUTS.SUBSCRIPTION_SEARCH,
  enableSecondOrder: true,
  includeTTagEvents: true,
};

/**
 * Search result accumulator
 */
class SearchResultAccumulator {
  private events: NDKEvent[] = [];
  private secondOrder: NDKEvent[] = [];
  private tTagEvents: NDKEvent[] = [];
  private eventIds: Set<string> = new Set();
  private addresses: Set<string> = new Set();
  private searchType: string;
  private searchTerm: string;
  private limit: number;
  private callbacks: SearchCallbacks;

  constructor(
    searchType: string,
    searchTerm: string,
    limit: number,
    callbacks: SearchCallbacks
  ) {
    this.searchType = searchType;
    this.searchTerm = searchTerm;
    this.limit = limit;
    this.callbacks = callbacks;
  }

  /**
   * Add a primary event to the results
   */
  addEvent(event: NDKEvent): void {
    if (this.events.length >= this.limit) {
      return;
    }

    if (!this.eventIds.has(event.id)) {
      this.events.push(event);
      this.eventIds.add(event.id);
      this.notifyUpdate();
    }
  }

  /**
   * Add a second-order event to the results
   */
  addSecondOrderEvent(event: NDKEvent): void {
    if (!this.eventIds.has(event.id)) {
      this.secondOrder.push(event);
      this.eventIds.add(event.id);
      this.notifyUpdate();
    }
  }

  /**
   * Add a t-tag event to the results
   */
  addTTagEvent(event: NDKEvent): void {
    if (!this.eventIds.has(event.id)) {
      this.tTagEvents.push(event);
      this.eventIds.add(event.id);
      this.notifyUpdate();
    }
  }

  /**
   * Add an address to the results
   */
  addAddress(address: string): void {
    this.addresses.add(address);
  }

  /**
   * Get the current search result
   */
  getResult(): SearchResult {
    return {
      events: this.events,
      secondOrder: this.secondOrder,
      tTagEvents: this.tTagEvents,
      eventIds: this.eventIds,
      addresses: this.addresses,
      searchType: this.searchType,
      searchTerm: this.searchTerm,
    };
  }

  /**
   * Notify callbacks of updates
   */
  private notifyUpdate(): void {
    if (this.callbacks.onSecondOrderUpdate) {
      this.callbacks.onSecondOrderUpdate(this.getResult());
    }
  }
}

/**
 * Creates a filter for the given search type and term
 */
function createSearchFilter(
  searchType: SearchSubscriptionType,
  searchTerm: string
): NDKFilter {
  const normalizedTerm = searchTerm.toLowerCase().trim();

  switch (searchType) {
    case "d":
      return {
        "#d": [normalizedTerm],
        limit: SEARCH_LIMITS.PRIMARY_SEARCH_RESULTS,
      };

    case "t":
      return {
        "#t": [normalizedTerm],
        limit: SEARCH_LIMITS.PRIMARY_SEARCH_RESULTS,
      };

    case "n":
      return {
        authors: [normalizedTerm],
        kinds: [0], // Profile metadata
        limit: SEARCH_LIMITS.SPECIFIC_PROFILE,
      };

    default:
      throw new Error(`Unsupported search type: ${searchType}`);
  }
}

/**
 * Performs a second-order search based on the primary search results
 */
async function performSecondOrderSearch(
  searchType: SearchSubscriptionType,
  primaryEvents: NDKEvent[],
  accumulator: SearchResultAccumulator,
  abortSignal?: AbortSignal,
  ndk?: NDK
): Promise<void> {
  if (searchType !== "d" && searchType !== "n") {
    return;
  }

  console.log(`[subscription_search] Starting second-order search for ${primaryEvents.length} primary events`);
  const secondOrderEvents: NDKEvent[] = [];
  const processedIds = new Set<string>();

  for (const event of primaryEvents) {
    if (abortSignal?.aborted) {
      break;
    }

    console.log(`[subscription_search] Processing event ${event.id} for second-order search`);

    // Extract event IDs and addresses for second-order search
    const eventIds = event.getMatchingTags("e").map(tag => tag[1]).filter(Boolean);
    const addresses = event.getMatchingTags("a").map(tag => tag[1]).filter(Boolean);

    for (const eventId of eventIds) {
      if (!processedIds.has(eventId)) {
        processedIds.add(eventId);
        accumulator.addAddress(eventId);
      }
    }

    for (const address of addresses) {
      if (!processedIds.has(address)) {
        processedIds.add(address);
        accumulator.addAddress(address);
      }
    }

    // For d-tag searches, look for events that reference the found events
    if (searchType === "d" && ndk) {
      try {
        // Get all available relays for second-order search
        const inboxRelays = get(activeInboxRelays);
        const outboxRelays = get(activeOutboxRelays);
        const allRelays = [...inboxRelays, ...outboxRelays];
        
        if (allRelays.length > 0) {
          // Create relay set for second-order search - use all relays directly
          const availableRelayUrls = allRelays;
          
          if (availableRelayUrls.length > 0) {
            const relaySet = NDKRelaySet.fromRelayUrls(availableRelayUrls, ndk);
            
            console.log(`[subscription_search] Looking for events referencing event ID: ${event.id}`);
            // Look for events that reference the found event by its ID
            const relatedEvents = await ndk.fetchEvents(
              {
                "#e": [event.id],
                kinds: [1, 30023], // Text notes and articles
                limit: SEARCH_LIMITS.SECOND_ORDER_RESULTS,
              },
              {
                groupable: true,
                skipVerification: false,
                skipValidation: false,
                relaySet: relaySet,
              }
            );

            console.log(`[subscription_search] Found ${relatedEvents.size} events referencing event ID`);
            for (const relatedEvent of relatedEvents) {
              if (abortSignal?.aborted) {
                break;
              }
              accumulator.addSecondOrderEvent(relatedEvent);
            }

            // Also look for events that reference the found event by its address (if it's addressable)
            const dTag = event.getMatchingTags("d")[0]?.[1];
            if (dTag) {
              const address = `${event.kind}:${event.pubkey}:${dTag}`;
              console.log(`[subscription_search] Looking for events referencing address: ${address}`);
              const addressRelatedEvents = await ndk.fetchEvents(
                {
                  "#a": [address],
                  kinds: [1, 30023], // Text notes and articles
                  limit: SEARCH_LIMITS.SECOND_ORDER_RESULTS,
                },
                {
                  groupable: true,
                  skipVerification: false,
                  skipValidation: false,
                  relaySet: relaySet,
                }
              );

              console.log(`[subscription_search] Found ${addressRelatedEvents.size} events referencing address`);
              for (const addressRelatedEvent of addressRelatedEvents) {
                if (abortSignal?.aborted) {
                  break;
                }
                accumulator.addSecondOrderEvent(addressRelatedEvent);
              }
            }
          }
        }
      } catch (error) {
        console.warn("Error fetching related events:", error);
      }
    }
  }
  
  console.log(`[subscription_search] Second-order search completed`);
}

/**
 * Performs a subscription-based search for Nostr events
 */
export async function searchBySubscription(
  searchType: SearchSubscriptionType,
  searchTerm: string,
  callbacks: SearchCallbacks = {},
  abortSignal?: AbortSignal,
  options: SearchOptions = {}
): Promise<SearchResult> {
  const mergedOptions = { ...DEFAULT_SEARCH_OPTIONS, ...options };
  const { limit, timeout, enableSecondOrder, includeTTagEvents } = mergedOptions;

  // Validate inputs
  if (!searchTerm || typeof searchTerm !== "string") {
    throw new Error("Search term must be a non-empty string");
  }

  if (!["d", "t", "n"].includes(searchType)) {
    throw new Error("Search type must be 'd', 't', or 'n'");
  }

  // Check if NDK is available
  const ndk = get(ndkInstance);
  if (!ndk) {
    throw new Error("NDK not initialized");
  }

  // Get all available relays (inbox and outbox)
  const inboxRelays = get(activeInboxRelays);
  const outboxRelays = get(activeOutboxRelays);
  const allRelays = [...inboxRelays, ...outboxRelays];
  
  if (allRelays.length === 0) {
    throw new Error("No relays available");
  }

  console.log("Subscription search starting:", {
    searchType,
    searchTerm,
    relayCount: allRelays.length,
    inboxRelayCount: inboxRelays.length,
    outboxRelayCount: outboxRelays.length,
    timeout,
    limit,
  });

  // Create result accumulator
  const accumulator = new SearchResultAccumulator(
    searchType,
    searchTerm,
    limit,
    callbacks
  );

  // Create search filter
  const filter = createSearchFilter(searchType, searchTerm);

  // Create subscription with timeout
  const subscriptionPromise = new Promise<SearchResult>((resolve, reject) => {
    let subscription: NDKSubscription | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    let eventCount = 0;
    const ndk = get(ndkInstance);

    const cleanup = () => {
      if (subscription) {
        try {
          subscription.stop();
        } catch (error) {
          console.warn("Error stopping subscription:", error);
        }
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };

    const handleTimeout = () => {
      cleanup();
      const result = accumulator.getResult();
      console.log("Subscription search completed (timeout):", {
        searchType,
        searchTerm,
        eventCount: result.events.length,
        secondOrderCount: result.secondOrder.length,
        tTagCount: result.tTagEvents.length,
      });
      resolve(result);
    };

    const handleError = (error: Error) => {
      cleanup();
      reject(error);
    };

    try {
      // Set up timeout
      timeoutId = setTimeout(handleTimeout, timeout);

      // Create subscription using all available relays
      if (!ndk) {
        throw new Error("NDK not available for subscription");
      }
      
      // Create relay set from all available relays for parallel search
      // Use all relay URLs directly since NDK will handle connection management
      const availableRelayUrls = allRelays;
      
      if (availableRelayUrls.length === 0) {
        throw new Error("No working relays available for subscription");
      }
      
      console.log("Creating subscription with", availableRelayUrls.length, "relays:", availableRelayUrls);
      
      // Create NDKRelaySet from relay URLs - NDK will handle connection management
      const relaySet = NDKRelaySet.fromRelayUrls(availableRelayUrls, ndk);
      
      subscription = ndk.subscribe(filter, {
        groupable: true,
        skipVerification: false,
        skipValidation: false,
        closeOnEose: true,
        relaySet: relaySet,
      });

      // Notify callback about subscription creation
      if (callbacks.onSubscriptionCreated && subscription) {
        callbacks.onSubscriptionCreated(subscription);
      }

      // Handle events
      subscription.on("event", (event: NDKEvent) => {
        if (abortSignal?.aborted) {
          cleanup();
          reject(new Error("Search cancelled"));
          return;
        }

        eventCount++;
        accumulator.addEvent(event);

        // Add t-tag events if enabled
        if (includeTTagEvents) {
          const tTags = event.getMatchingTags("t");
          if (tTags.length > 0) {
            accumulator.addTTagEvent(event);
          }
        }

        // Check if we've reached the limit
        if (eventCount >= limit) {
          cleanup();
          const result = accumulator.getResult();
          console.log("Subscription search completed (limit reached):", {
            searchType,
            searchTerm,
            eventCount: result.events.length,
            secondOrderCount: result.secondOrder.length,
            tTagCount: result.tTagEvents.length,
          });
          resolve(result);
        }
      });

      // Handle subscription end
      subscription.on("eose", () => {
        cleanup();
        const result = accumulator.getResult();
        console.log("Subscription search completed (EOSE):", {
          searchType,
          searchTerm,
          eventCount: result.events.length,
          secondOrderCount: result.secondOrder.length,
          tTagCount: result.tTagEvents.length,
        });
        resolve(result);
      });

      // Handle subscription errors
      if (subscription) {
        subscription.on("close", () => {
          // Handle subscription close
        });
      }

    } catch (error) {
      cleanup();
      handleError(error instanceof Error ? error : new Error(String(error)));
    }
  });

  // Wait for subscription to complete or timeout
  const result = await Promise.race([
    subscriptionPromise,
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Search timeout: No results received within ${timeout / 1000} seconds`));
      }, timeout);
    }),
  ]);

  // Perform second-order search if enabled
  if (enableSecondOrder && result.events.length > 0) {
    try {
      console.log(`[subscription_search] Starting second-order search with timeout: ${timeout * 2}ms`);
      await Promise.race([
        performSecondOrderSearch(
          searchType,
          result.events,
          accumulator,
          abortSignal,
          ndk
        ),
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Second-order search timeout: No results received within ${(timeout * 2) / 1000} seconds`));
          }, timeout * 2);
        }),
      ]);
      console.log(`[subscription_search] Second-order search completed successfully`);
    } catch (error) {
      console.warn("Second-order search failed:", error);
    }
  }

  return accumulator.getResult();
}
