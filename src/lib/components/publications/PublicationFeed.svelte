<script lang="ts">
  import { indexKind } from "$lib/consts";
  import { ndkInstance, activeInboxRelays, activeOutboxRelays } from "$lib/ndk";
  import { filterValidIndexEvents, debounceAsync } from "$lib/utils";
  import { Button, P, Skeleton, Spinner } from "flowbite-svelte";
  import ArticleHeader from "./PublicationHeader.svelte";
  import { onMount, onDestroy } from "svelte";
  import {
    getMatchingTags,
  } from "$lib/utils/nostrUtils";
  import { WebSocketPool } from "$lib/data_structures/websocket_pool";
  import { NDKEvent } from "@nostr-dev-kit/ndk";
  import { searchCache } from "$lib/utils/searchCache";
  import { indexEventCache } from "$lib/utils/indexEventCache";
  import { isValidNip05Address } from "$lib/utils/search_utility";

  const props = $props<{
    searchQuery?: string;
    onEventCountUpdate?: (counts: { displayed: number; total: number }) => void;
  }>();

  // Component state
  let eventsInView: NDKEvent[] = $state([]);
  let loadingMore: boolean = $state(false);
  let endOfFeed: boolean = $state(false);
  let relayStatuses = $state<Record<string, "pending" | "found" | "notfound">>({});
  let loading: boolean = $state(true);
  let hasInitialized = $state(false);
  let fallbackTimeout: ReturnType<typeof setTimeout> | null = null;

  // Relay management
  let allRelays: string[] = $state([]);
  let ndk = $derived($ndkInstance);

  // Event management
  let allIndexEvents: NDKEvent[] = $state([]);

  // Initialize relays and fetch events
  async function initializeAndFetch() {
    if (!ndk) {
      console.debug('[PublicationFeed] No NDK instance available');
      return;
    }

    // Get relays from active stores
    const inboxRelays = $activeInboxRelays;
    const outboxRelays = $activeOutboxRelays;
    const newRelays = [...inboxRelays, ...outboxRelays];

    console.debug('[PublicationFeed] Available relays:', {
      inboxCount: inboxRelays.length,
      outboxCount: outboxRelays.length,
      totalCount: newRelays.length,
      relays: newRelays
    });

    if (newRelays.length === 0) {
      console.debug('[PublicationFeed] No relays available, waiting...');
      return;
    }

    // Update allRelays if different
    const currentRelaysString = allRelays.sort().join(',');
    const newRelaysString = newRelays.sort().join(',');
    
    if (currentRelaysString !== newRelaysString) {
      allRelays = newRelays;
      console.debug('[PublicationFeed] Relays updated, fetching events');
      await fetchAllIndexEventsFromRelays();
    }
  }

  // Watch for relay store changes
  $effect(() => {
    const inboxRelays = $activeInboxRelays;
    const outboxRelays = $activeOutboxRelays;
    const newRelays = [...inboxRelays, ...outboxRelays];

    if (newRelays.length > 0 && !hasInitialized) {
      console.debug('[PublicationFeed] Relays available, initializing');
      hasInitialized = true;
      if (fallbackTimeout) {
        clearTimeout(fallbackTimeout);
        fallbackTimeout = null;
      }
      setTimeout(() => initializeAndFetch(), 0);
    } else if (newRelays.length === 0 && !hasInitialized) {
      console.debug('[PublicationFeed] No relays available, setting up fallback');
      if (!fallbackTimeout) {
        fallbackTimeout = setTimeout(() => {
          console.debug('[PublicationFeed] Fallback timeout reached, retrying');
          hasInitialized = true;
          initializeAndFetch();
        }, 3000);
      }
    }
  });

  async function fetchAllIndexEventsFromRelays() {
    console.debug('[PublicationFeed] fetchAllIndexEventsFromRelays called with relays:', {
      allRelaysCount: allRelays.length,
      allRelays: allRelays
    });
    
    if (!ndk) {
      console.error('[PublicationFeed] No NDK instance available');
      loading = false;
      return;
    }

    if (allRelays.length === 0) {
      console.debug('[PublicationFeed] No relays available for fetching');
      loading = false;
      return;
    }

    // Check cache first
    const cachedEvents = indexEventCache.get(allRelays);
    if (cachedEvents) {
      console.log(
        `[PublicationFeed] Using cached index events (${cachedEvents.length} events)`,
      );
      allIndexEvents = cachedEvents;
      eventsInView = allIndexEvents.slice(0, 30);
      endOfFeed = allIndexEvents.length <= 30;
      loading = false;
      return;
    }

    loading = true;
    relayStatuses = Object.fromEntries(
      allRelays.map((r: string) => [r, "pending"]),
    );
    let allEvents: NDKEvent[] = [];
    const eventMap = new Map<string, NDKEvent>();

    // Helper to fetch from a single relay with timeout
    async function fetchFromRelay(relay: string): Promise<void> {
      try {
        console.debug(`[PublicationFeed] Fetching from relay: ${relay}`);
        
        // Use WebSocketPool to get a pooled connection
        const ws = await WebSocketPool.instance.acquire(relay);
        const subId = crypto.randomUUID();
        
        // Create a promise that resolves with the events
        const eventPromise = new Promise<Set<NDKEvent>>((resolve, reject) => {
          const events = new Set<NDKEvent>();
          
          const messageHandler = (ev: MessageEvent) => {
            try {
              const data = JSON.parse(ev.data);
              
              if (data[0] === "EVENT" && data[1] === subId) {
                const event = new NDKEvent(ndk, data[2]);
                events.add(event);
              } else if (data[0] === "EOSE" && data[1] === subId) {
                resolve(events);
              }
            } catch (error) {
              console.error(`[PublicationFeed] Error parsing message from ${relay}:`, error);
            }
          };
          
          const errorHandler = (ev: Event) => {
            reject(new Error(`WebSocket error for ${relay}: ${ev}`));
          };
          
          ws.addEventListener("message", messageHandler);
          ws.addEventListener("error", errorHandler);
          
          // Send the subscription request
          ws.send(JSON.stringify([
            "REQ", 
            subId, 
            { kinds: [indexKind], limit: 1000 }
          ]));
          
          // Set up cleanup
          setTimeout(() => {
            ws.removeEventListener("message", messageHandler);
            ws.removeEventListener("error", errorHandler);
            WebSocketPool.instance.release(ws);
            resolve(events);
          }, 5000);
        });
        
        let eventSet = await eventPromise;
        
        console.debug(`[PublicationFeed] Raw events from ${relay}:`, eventSet.size);
        eventSet = filterValidIndexEvents(eventSet);
        console.debug(`[PublicationFeed] Valid events from ${relay}:`, eventSet.size);
        
        relayStatuses = { ...relayStatuses, [relay]: "found" };
        
        // Add new events to the map and update the view immediately
        const newEvents: NDKEvent[] = [];
        for (const event of eventSet) {
          const tagAddress = event.tagAddress();
          if (!eventMap.has(tagAddress)) {
            eventMap.set(tagAddress, event);
            newEvents.push(event);
          }
        }
        
        if (newEvents.length > 0) {
          // Update allIndexEvents with new events
          allIndexEvents = Array.from(eventMap.values());
          // Sort by created_at descending
          allIndexEvents.sort((a, b) => b.created_at! - a.created_at!);
          
          // Update the view immediately with new events
          eventsInView = allIndexEvents.slice(0, 30);
          endOfFeed = allIndexEvents.length <= 30;
          
          console.debug(`[PublicationFeed] Updated view with ${newEvents.length} new events from ${relay}, total: ${allIndexEvents.length}`);
        }
      } catch (err) {
        console.error(`[PublicationFeed] Error fetching from relay ${relay}:`, err);
        relayStatuses = { ...relayStatuses, [relay]: "notfound" };
      }
    }

    // Fetch from all relays in parallel, return events as they arrive
    console.debug(`[PublicationFeed] Starting fetch from ${allRelays.length} relays`);
    
    // Start all relay fetches in parallel
    const fetchPromises = allRelays.map(fetchFromRelay);
    
    // Wait for all to complete (but events are shown as they arrive)
    await Promise.allSettled(fetchPromises);
    
    console.debug(`[PublicationFeed] All relays completed, final event count:`, allIndexEvents.length);
    
    // Cache the fetched events
    indexEventCache.set(allRelays, allIndexEvents);

    // Final update to ensure we have the latest view
    eventsInView = allIndexEvents.slice(0, 30);
    endOfFeed = allIndexEvents.length <= 30;
    loading = false;
  }

  // Function to filter events based on search query
  const filterEventsBySearch = (events: NDKEvent[]) => {
    if (!props.searchQuery) return events;
    const query = props.searchQuery.toLowerCase();
    console.debug(
      "[PublicationFeed] Filtering events with query:",
      query,
      "Total events before filter:",
      events.length,
    );

    // Check cache first for publication search
    const cachedResult = searchCache.get("publication", query);
    if (cachedResult) {
      console.log(
        `[PublicationFeed] Using cached results for publication search: ${query}`,
      );
      return cachedResult.events;
    }

    // Check if the query is a NIP-05 address
    const isNip05Query = isValidNip05Address(query);
    console.debug("[PublicationFeed] Is NIP-05 query:", isNip05Query);

    const filtered = events.filter((event) => {
      const title =
        getMatchingTags(event, "title")[0]?.[1]?.toLowerCase() ?? "";
      const authorName =
        getMatchingTags(event, "author")[0]?.[1]?.toLowerCase() ?? "";
      const authorPubkey = event.pubkey.toLowerCase();
      const nip05 =
        getMatchingTags(event, "nip05")[0]?.[1]?.toLowerCase() ?? "";

      // For NIP-05 queries, only match against NIP-05 tags
      if (isNip05Query) {
        const matches = nip05 === query;
        if (matches) {
          console.debug("[PublicationFeed] Event matches NIP-05 search:", {
            id: event.id,
            nip05,
            authorPubkey,
          });
        }
        return matches;
      }

      // For regular queries, match against all fields
      const matches =
        title.includes(query) ||
        authorName.includes(query) ||
        authorPubkey.includes(query) ||
        nip05.includes(query);
      if (matches) {
        console.debug("[PublicationFeed] Event matches search:", {
          id: event.id,
          title,
          authorName,
          authorPubkey,
          nip05,
        });
      }
      return matches;
    });

    // Cache the filtered results
    const result = {
      events: filtered,
      secondOrder: [],
      tTagEvents: [],
      eventIds: new Set<string>(),
      addresses: new Set<string>(),
      searchType: "publication",
      searchTerm: query,
    };
    searchCache.set("publication", query, result);

    console.debug("[PublicationFeed] Events after filtering:", filtered.length);
    return filtered;
  };

  // Debounced search function
  const debouncedSearch = debounceAsync(async (query: string) => {
    console.debug("[PublicationFeed] Search query changed:", query);
    if (query && query.trim()) {
      const filtered = filterEventsBySearch(allIndexEvents);
      eventsInView = filtered.slice(0, 30);
      endOfFeed = filtered.length <= 30;
    } else {
      eventsInView = allIndexEvents.slice(0, 30);
      endOfFeed = allIndexEvents.length <= 30;
    }
  }, 300);

  $effect(() => {
    debouncedSearch(props.searchQuery);
  });

  // Emit event count updates
  $effect(() => {
    if (props.onEventCountUpdate) {
      props.onEventCountUpdate({
        displayed: eventsInView.length,
        total: allIndexEvents.length
      });
    }
  });

  async function loadMorePublications() {
    loadingMore = true;
    const current = eventsInView.length;
    let source = props.searchQuery.trim()
      ? filterEventsBySearch(allIndexEvents)
      : allIndexEvents;
    eventsInView = source.slice(0, current + 30);
    endOfFeed = eventsInView.length >= source.length;
    loadingMore = false;
  }

  function getSkeletonIds(): string[] {
    const skeletonHeight = 192; // The height of the card component in pixels (h-48 = 12rem = 192px).
    const skeletonCount = Math.floor(window.innerHeight / skeletonHeight) - 2;
    const skeletonIds = [];
    for (let i = 0; i < skeletonCount; i++) {
      skeletonIds.push(`skeleton-${i}`);
    }
    return skeletonIds;
  }

  function getCacheStats(): string {
    const indexStats = indexEventCache.getStats();
    const searchStats = searchCache.size();
    return `Index: ${indexStats.size} entries (${indexStats.totalEvents} events), Search: ${searchStats} entries`;
  }

  // Cleanup function for fallback timeout
  function cleanup() {
    if (fallbackTimeout) {
      clearTimeout(fallbackTimeout);
      fallbackTimeout = null;
    }
  }

  // Cleanup on component destruction
  onDestroy(() => {
    cleanup();
  });

  onMount(async () => {
    console.debug('[PublicationFeed] onMount called');
    // The effect will handle fetching when relays become available
  });
</script>

<div class="flex flex-col space-y-4">
  <div
    class="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 w-full"
  >
    {#if loading && eventsInView.length === 0}
      {#each getSkeletonIds() as id}
        <Skeleton divClass="skeleton-leather w-full" size="lg" />
      {/each}
    {:else if eventsInView.length > 0}
      {#each eventsInView as event}
        <ArticleHeader {event} />
      {/each}
    {:else}
      <div class="col-span-full">
        <p class="text-center">No publications found.</p>
      </div>
    {/if}
  </div>

  {#if !loadingMore && !endOfFeed}
    <div class="flex justify-center mt-4 mb-8">
      <Button
        outline
        class="w-full max-w-md"
        onclick={async () => {
          await loadMorePublications();
        }}
      >
        Show more publications
      </Button>
    </div>
  {:else if loadingMore}
    <div class="flex justify-center mt-4 mb-8">
      <Button outline disabled class="w-full max-w-md">
        <Spinner class="mr-3 text-gray-600 dark:text-gray-300" size="4" />
        Loading...
      </Button>
    </div>
  {:else}
    <div class="flex justify-center mt-4 mb-8">
      <P class="text-sm text-gray-700 dark:text-gray-300"
        >You've reached the end of the feed.</P
      >
    </div>
  {/if}
</div>
