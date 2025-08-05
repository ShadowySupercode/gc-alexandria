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
  import { userStore } from "$lib/stores/userStore.ts";
  import { nip19 } from "nostr-tools";

  const props = $props<{
    searchQuery?: string;
    showOnlyMyPublications?: boolean;
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
  let gridContainer: HTMLElement;

  // Relay management
  let allRelays: string[] = $state([]);
  let ndk = $derived($ndkInstance);

  // Event management
  let allIndexEvents: NDKEvent[] = $state([]);

  // Calculate the number of columns based on window width
  let columnCount = $state(1);
  let publicationsToDisplay = $state(10);

  // Update column count and publications when window resizes
  $effect(() => {
    if (typeof window !== 'undefined') {
      const width = window.innerWidth;
      let newColumnCount = 1;
      if (width >= 1280) newColumnCount = 4; // xl:grid-cols-4
      else if (width >= 1024) newColumnCount = 3; // lg:grid-cols-3
      else if (width >= 768) newColumnCount = 2; // md:grid-cols-2
      
      if (columnCount !== newColumnCount) {
        columnCount = newColumnCount;
        publicationsToDisplay = newColumnCount * 10;
        
        // Update the view immediately when column count changes
        if (allIndexEvents.length > 0) {
          let source = allIndexEvents;
          
          // Apply user filter first
          source = filterEventsByUser(source);
          
          // Then apply search filter if query exists
          if (props.searchQuery?.trim()) {
            source = filterEventsBySearch(source);
          }
          
          eventsInView = source.slice(0, publicationsToDisplay);
          endOfFeed = eventsInView.length >= source.length;
        }
      }
    }
  });

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
      // Set up a retry mechanism when relays become available
      const unsubscribe = activeInboxRelays.subscribe((relays) => {
        if (relays.length > 0 && !hasInitialized) {
          console.debug('[PublicationFeed] Relays now available, retrying initialization');
          unsubscribe();
          setTimeout(() => {
            hasInitialized = true;
            initializeAndFetch();
          }, 1000);
        }
      });
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
      eventsInView = allIndexEvents.slice(0, publicationsToDisplay);
      endOfFeed = allIndexEvents.length <= publicationsToDisplay;
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
          eventsInView = allIndexEvents.slice(0, publicationsToDisplay);
          endOfFeed = allIndexEvents.length <= publicationsToDisplay;
          
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
    eventsInView = allIndexEvents.slice(0, publicationsToDisplay);
    endOfFeed = allIndexEvents.length <= publicationsToDisplay;
    loading = false;
  }

  // Function to convert various Nostr identifiers to npub
  const convertToNpub = (input: string): string | null => {
    try {
      // If it's already an npub, return it
      if (input.startsWith('npub')) {
        return input;
      }
      
      // If it's a hex pubkey, convert to npub
      if (input.length === 64 && /^[0-9a-fA-F]+$/.test(input)) {
        return nip19.npubEncode(input);
      }
      
      // If it's an nprofile, decode and extract npub
      if (input.startsWith('nprofile')) {
        const decoded = nip19.decode(input);
        if (decoded.type === 'nprofile') {
          return decoded.data.pubkey ? nip19.npubEncode(decoded.data.pubkey) : null;
        }
      }
      
      return null;
    } catch (error) {
      console.debug("[PublicationFeed] Failed to convert to npub:", input, error);
      return null;
    }
  };

  // Function to filter events by npub (author or p tags)
  const filterEventsByNpub = (events: NDKEvent[], npub: string): NDKEvent[] => {
    try {
      const decoded = nip19.decode(npub);
      if (decoded.type !== 'npub') {
        console.debug("[PublicationFeed] Invalid npub format:", npub);
        return events;
      }
      
      const pubkey = decoded.data.toLowerCase();
      console.debug("[PublicationFeed] Filtering events for npub:", npub, "pubkey:", pubkey);
      
      const filtered = events.filter((event) => {
        // Check if user is the author of the event
        const eventPubkey = event.pubkey.toLowerCase();
        const isAuthor = eventPubkey === pubkey;
        
        // Check if user is listed in "p" tags (participants/contributors)
        const pTags = getMatchingTags(event, "p");
        const isInPTags = pTags.some(tag => tag[1]?.toLowerCase() === pubkey);
        
        const matches = isAuthor || isInPTags;
        
        if (matches) {
          console.debug("[PublicationFeed] Event matches npub filter:", {
            id: event.id,
            eventPubkey,
            searchPubkey: pubkey,
            isAuthor,
            isInPTags,
            pTags: pTags.map(tag => tag[1])
          });
        }
        return matches;
      });
      
      console.debug("[PublicationFeed] Events after npub filtering:", filtered.length);
      return filtered;
    } catch (error) {
      console.debug("[PublicationFeed] Error filtering by npub:", npub, error);
      return events;
    }
  };

  // Function to filter events by current user's pubkey
  const filterEventsByUser = (events: NDKEvent[]) => {
    if (!props.showOnlyMyPublications) return events;
    
    const currentUser = $userStore;
    if (!currentUser.signedIn || !currentUser.pubkey) {
      console.debug("[PublicationFeed] User not signed in or no pubkey, showing all events");
      return events;
    }
    
    const userPubkey = currentUser.pubkey.toLowerCase();
    console.debug("[PublicationFeed] Filtering events for user:", userPubkey);
    
    const filtered = events.filter((event) => {
      // Check if user is the author of the event
      const eventPubkey = event.pubkey.toLowerCase();
      const isAuthor = eventPubkey === userPubkey;
      
      // Check if user is listed in "p" tags (participants/contributors)
      const pTags = getMatchingTags(event, "p");
      const isInPTags = pTags.some(tag => tag[1]?.toLowerCase() === userPubkey);
      
      const matches = isAuthor || isInPTags;
      
      if (matches) {
        console.debug("[PublicationFeed] Event matches user filter:", {
          id: event.id,
          eventPubkey,
          userPubkey,
          isAuthor,
          isInPTags,
          pTags: pTags.map(tag => tag[1])
        });
      }
      return matches;
    });
    
    console.debug("[PublicationFeed] Events after user filtering:", filtered.length);
    return filtered;
  };

  // Function to filter events based on search query
  const filterEventsBySearch = (events: NDKEvent[]) => {
    if (!props.searchQuery) return events;
    const query = props.searchQuery.trim();
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

    // AI-NOTE: Check if the query is a Nostr identifier (npub, hex, nprofile)
    const npub = convertToNpub(query);
    if (npub) {
      console.debug("[PublicationFeed] Query is a Nostr identifier, filtering by npub:", npub);
      const filtered = filterEventsByNpub(events, npub);
      
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
      
      return filtered;
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
        const matches = nip05 === query.toLowerCase();
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
      const queryLower = query.toLowerCase();
      const matches =
        title.includes(queryLower) ||
        authorName.includes(queryLower) ||
        authorPubkey.includes(queryLower) ||
        nip05.includes(queryLower);
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
    console.debug("[PublicationFeed] Search query or user filter changed:", query);
    let filtered = allIndexEvents;
    
    // Apply user filter first
    filtered = filterEventsByUser(filtered);
    
    // Then apply search filter if query exists
    if (query && query.trim()) {
      filtered = filterEventsBySearch(filtered);
    }
    
    eventsInView = filtered.slice(0, publicationsToDisplay);
    endOfFeed = filtered.length <= publicationsToDisplay;
  }, 300);

  // AI-NOTE: Watch for changes in search query and user filter
  $effect(() => {
    // Trigger search when either search query or user filter changes
    // Also watch for changes in user store to update filter when user logs in/out
    debouncedSearch(props.searchQuery);
  });

  // AI-NOTE: Watch for changes in the user filter checkbox
  $effect(() => {
    // Trigger filtering when the user filter checkbox changes
    // Access both props to ensure the effect runs when either changes
    const searchQuery = props.searchQuery;
    const showOnlyMyPublications = props.showOnlyMyPublications;
    debouncedSearch(searchQuery);
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
    let source = allIndexEvents;
    
    // Apply user filter first
    source = filterEventsByUser(source);
    
    // Then apply search filter if query exists
    if (props.searchQuery.trim()) {
      source = filterEventsBySearch(source);
    }
    
    eventsInView = source.slice(0, current + publicationsToDisplay);
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

  onMount(() => {
    console.debug('[PublicationFeed] onMount called');
    // The effect will handle fetching when relays become available
    
    // Add window resize listener for responsive updates
    const handleResize = () => {
      if (typeof window !== 'undefined') {
        const width = window.innerWidth;
        let newColumnCount = 1;
        if (width >= 1280) newColumnCount = 4; // xl:grid-cols-4
        else if (width >= 1024) newColumnCount = 3; // lg:grid-cols-3
        else if (width >= 768) newColumnCount = 2; // md:grid-cols-2
        
        if (columnCount !== newColumnCount) {
          columnCount = newColumnCount;
          publicationsToDisplay = newColumnCount * 10;
          
          // Update the view immediately when column count changes
          if (allIndexEvents.length > 0) {
            let source = allIndexEvents;
            
            // Apply user filter first
            source = filterEventsByUser(source);
            
            // Then apply search filter if query exists
            if (props.searchQuery?.trim()) {
              source = filterEventsBySearch(source);
            }
            
            eventsInView = source.slice(0, publicationsToDisplay);
            endOfFeed = eventsInView.length >= source.length;
          }
        }
      }
    };
    
    window.addEventListener('resize', handleResize);
    
    // Initial calculation
    handleResize();
    
    // Cleanup function
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  });
</script>

<div class="flex flex-col space-y-4">
  <div
    bind:this={gridContainer}
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
