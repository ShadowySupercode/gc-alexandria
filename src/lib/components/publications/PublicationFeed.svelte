<script lang="ts">
  import { indexKind, secondaryRelays, searchRelays } from "$lib/consts";
  import { SEARCH_LIMITS } from "$lib/utils/search_constants.ts";
  import { activeInboxRelays, activeOutboxRelays, getNdkContext } from "$lib/ndk";
  import { filterValidIndexEvents, debounceAsync } from "$lib/utils";
  import { Button, P, Skeleton, Spinner } from "flowbite-svelte";
  import ArticleHeader from "./PublicationHeader.svelte";
  import { onMount, onDestroy } from "svelte";
  import {
    getMatchingTags,
    toNpub,
  } from "$lib/utils/nostrUtils";
  import { WebSocketPool } from "$lib/data_structures/websocket_pool";
  import { NDKEvent } from "@nostr-dev-kit/ndk";
  import { searchCache } from "$lib/utils/searchCache";
  import { indexEventCache } from "$lib/utils/indexEventCache";
  import { isValidNip05Address } from "$lib/utils/search_utility";
  import { userStore } from "$lib/stores/userStore.ts";
  import { nip19 } from "nostr-tools";
  import { LabelManager } from "./labelManager";

  const props = $props<{
    searchQuery?: string;
    showOnlyMyPublications?: boolean;
    useFullRelaySet?: boolean;
    onEventCountUpdate?: (counts: { displayed: number; total: number }) => void;
  }>();

  const ndk = getNdkContext();

  // Component state
  let eventsInView: NDKEvent[] = $state([]);
  let loadingMore: boolean = $state(false);
  let endOfFeed: boolean = $state(false);
  let relayStatuses = $state<Record<string, "pending" | "found" | "notfound">>({});
  let loading: boolean = $state(true);
  let hasInitialized = $state(false);
  let fallbackTimeout: ReturnType<typeof setTimeout> | null = null;
  let gridContainer: HTMLElement;
  let topLevelEventCount: number = $state(0);

  // Relay management
  let allRelays: string[] = $state([]);

  // Event management
  let allIndexEvents: NDKEvent[] = $state([]);

  // Label management
  const labelManager = new LabelManager();

  // Calculate the number of columns based on window width
  let columnCount = $state(1);
  let publicationsToDisplay = $state(10);

  // Initialize relays and fetch events
  // AI-NOTE: This function is called when the component mounts and when relay configuration changes
  // For the feed, we use only secondaryRelays + user's personal relays (deduplicated)
  // Search functionality uses the full relay set via activeInboxRelays/activeOutboxRelays
  // AI-NOTE: Fetch labels FIRST, then fetch 30040 events and filter by labels
  async function initializeAndFetch() {
    if (!ndk) {
      console.debug('[PublicationFeed] No NDK instance available');
      return;
    }

    // Get user's personal relays from active stores
    const inboxRelays = $activeInboxRelays;
    const outboxRelays = $activeOutboxRelays;
    const userRelays = [...inboxRelays, ...outboxRelays];
    
    // Combine relays based on checkbox state
    // If useFullRelaySet is true, include searchRelays; otherwise just secondaryRelays
    const baseRelays = props.useFullRelaySet 
      ? [...secondaryRelays, ...searchRelays]
      : secondaryRelays;
    
    // Combine base relays with user's personal relays and deduplicate
    const feedRelays = [...new Set([...baseRelays, ...userRelays])];

    console.debug('[PublicationFeed] Feed relays (secondary + user):', {
      secondaryCount: secondaryRelays.length,
      userRelayCount: userRelays.length,
      totalCount: feedRelays.length,
      relays: feedRelays
    });

    if (feedRelays.length === 0) {
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
    const newRelaysString = feedRelays.sort().join(',');
    
    if (currentRelaysString !== newRelaysString) {
      allRelays = feedRelays;
      console.debug('[PublicationFeed] Feed relays updated, fetching labels first, then events');
      
      // Fetch ALL labels first
      await fetchAllLabel1985Events();
      
      // Then fetch 30040 events (they will be filtered/sorted by the label maps)
      await fetchAllIndexEventsFromRelays();
    }
  }

  // Watch for relay store changes, user authentication state, and full relay set checkbox
  $effect(() => {
    const inboxRelays = $activeInboxRelays;
    const outboxRelays = $activeOutboxRelays;
    const userRelays = [...inboxRelays, ...outboxRelays];
    const useFullRelaySet = props.useFullRelaySet;
    // Combine relays based on checkbox state
    const baseRelays = useFullRelaySet 
      ? [...secondaryRelays, ...searchRelays]
      : secondaryRelays;
    const feedRelays = [...new Set([...baseRelays, ...userRelays])];
    const userState = $userStore;

    if (feedRelays.length > 0 && !hasInitialized) {
      console.debug('[PublicationFeed] Feed relays available, initializing');
      hasInitialized = true;
      if (fallbackTimeout) {
        clearTimeout(fallbackTimeout);
        fallbackTimeout = null;
      }
      setTimeout(() => initializeAndFetch(), 0);
    } else if (feedRelays.length === 0 && !hasInitialized) {
      console.debug('[PublicationFeed] No feed relays available, setting up fallback');
      if (!fallbackTimeout) {
        fallbackTimeout = setTimeout(() => {
          console.debug('[PublicationFeed] Fallback timeout reached, retrying');
          hasInitialized = true;
          initializeAndFetch();
        }, 3000);
      }
    } else if (hasInitialized && feedRelays.length > 0) {
      // AI-NOTE: Re-fetch events when user authentication state changes, relays are updated, or checkbox changes
      // This ensures that when a user logs in and their relays are loaded, or when the checkbox is toggled, we fetch events from those relays
      const currentRelaysString = allRelays.sort().join(',');
      const newRelaysString = feedRelays.sort().join(',');
      
      if (currentRelaysString !== newRelaysString) {
        console.debug('[PublicationFeed] Feed relay configuration changed, re-fetching events');
        // Clear cache to force fresh fetch from new relays
        indexEventCache.clear();
        setTimeout(() => initializeAndFetch(), 0);
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
      
      // Labels should already be loaded from initializeAndFetch
      // Filter to only top-level events first, then sort by relevance
      const topLevelEvents = filterToTopLevelOnly(allIndexEvents);
      topLevelEventCount = topLevelEvents.length;
      const sorted = sortEventsByRelevance(topLevelEvents);
      let filtered = filterEventsByUser(sorted);
      if (props.searchQuery?.trim()) {
        filtered = filterEventsBySearch(filtered);
      }
      eventsInView = filtered.slice(0, publicationsToDisplay);
      endOfFeed = filtered.length <= publicationsToDisplay;
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
            { kinds: [indexKind], limit: SEARCH_LIMITS.PUBLICATION_FEED_LIMIT }
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
          // Update allIndexEvents with new events (but don't show them yet - wait for labels)
          allIndexEvents = Array.from(eventMap.values());
          
          // AI-NOTE: Clear publication search cache when new events are loaded to prevent stale results
          // This ensures searches will re-run with the updated event set
          searchCache.clearType("publication");
          console.debug(`[PublicationFeed] Loaded ${newEvents.length} new events from ${relay}, total: ${allIndexEvents.length} (waiting for labels before displaying)`);
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

    // Labels should already be loaded from initializeAndFetch
    // Filter to only top-level events first, then sort by relevance
    console.debug(`[PublicationFeed] Filtering ${allIndexEvents.length} events to top-level only`);
    const topLevelEvents = filterToTopLevelOnly(allIndexEvents);
    topLevelEventCount = topLevelEvents.length;
    console.debug(`[PublicationFeed] Found ${topLevelEvents.length} top-level events`);
    
    // Sort top-level events by relevance (labeled first, then newest)
    const labelStats = labelManager.getStats();
    console.debug(`[PublicationFeed] Sorting ${topLevelEvents.length} top-level events using ${labelStats.totalLabels} label events`);
    const sorted = sortEventsByRelevance(topLevelEvents);
    console.debug(`[PublicationFeed] After sorting: ${sorted.length} events`);
    
    let filtered = filterEventsByUser(sorted);
    if (props.searchQuery?.trim()) {
      filtered = filterEventsBySearch(filtered);
    }
    
    console.debug(`[PublicationFeed] Setting eventsInView: ${filtered.length} events, showing first ${publicationsToDisplay}`);
    eventsInView = filtered.slice(0, publicationsToDisplay);
    endOfFeed = filtered.length <= publicationsToDisplay;
    loading = false;
    
    console.debug(`[PublicationFeed] Display complete. eventsInView.length: ${eventsInView.length}, loading: ${loading}`);
  }

  // Fetch ALL kind 1985 label events (no filters)
  // AI-NOTE: Fetch all labels first, then use them to filter/sort 30040 events
  // This is more efficient than fetching labels per 30040 event
  async function fetchAllLabel1985Events() {
    if (!ndk) {
      return;
    }

    // Use full relay set for label fetching (not just feed relays)
    const fullInboxRelays = $activeInboxRelays;
    const fullOutboxRelays = $activeOutboxRelays;
    const fullRelaySet = [...fullInboxRelays, ...fullOutboxRelays];
    
    if (fullRelaySet.length === 0) {
      return;
    }

    console.debug('[PublicationFeed] Fetching labels via LabelManager');
    await labelManager.fetchLabels(fullRelaySet, ndk);

    const stats = labelManager.getStats();
    console.debug(`[PublicationFeed] Label stats: ${stats.totalLabels} total, ${stats.addressMappings} addresses, ${stats.eventIdMappings} event IDs`);
  }

  // Function to convert various Nostr identifiers to npub using the utility function
  const convertToNpub = (input: string): string | null => {
    const result = toNpub(input);
    if (!result) {
      console.debug("[PublicationFeed] Failed to convert to npub:", input);
    }
    return result;
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


  // Function to check if an event has a 1985 label
  const has1985Label = (event: NDKEvent): boolean => {
    return labelManager.has1985Label(event);
  };

  // Function to check if an event is top-level (not referenced by other 30040s)
  const isTopLevel = (event: NDKEvent, referencedAddresses: Set<string>): boolean => {
    const address = event.tagAddress();
    return !referencedAddresses.has(address);
  };

  // Function to filter events to only top-level events
  const filterToTopLevelOnly = (events: NDKEvent[]): NDKEvent[] => {
    const referencedAddresses = getReferencedAddresses();
    const filtered = events.filter(event => {
      const address = event.tagAddress();
      if (!address) {
        return false; // Events without addresses are not top-level
      }
      const isTop = !referencedAddresses.has(address);
      return isTop;
    });
    console.debug(`[PublicationFeed] filterToTopLevelOnly: ${events.length} total events -> ${filtered.length} top-level events (${referencedAddresses.size} addresses referenced by other events)`);
    return filtered;
  };

  // Build referenced addresses set for top-level check (cached)
  const getReferencedAddresses = (): Set<string> => {
    const referencedAddresses = new Set<string>();
    for (const event of allIndexEvents) {
      const aTags = getMatchingTags(event, "a");
      for (const aTag of aTags) {
        if (aTag[1]) {
          const parts = aTag[1].split(":");
          if (parts.length >= 3 && parts[0] === "30040") {
            referencedAddresses.add(aTag[1]);
          }
        }
      }
    }
    return referencedAddresses;
  };

  // Function to sort events by relevance: labeled events first (newest first), then top-level (newest first), then rest (newest first)
  const sortEventsByRelevance = (events: NDKEvent[]): NDKEvent[] => {
    const referencedAddresses = getReferencedAddresses();

    const labeled: NDKEvent[] = [];
    const topLevel: NDKEvent[] = [];
    const rest: NDKEvent[] = [];

    for (const event of events) {
      if (has1985Label(event)) {
        labeled.push(event);
      } else if (isTopLevel(event, referencedAddresses)) {
        topLevel.push(event);
      } else {
        rest.push(event);
      }
    }

    // Sort each group by created_at descending (newest first)
    const sortByCreatedAt = (a: NDKEvent, b: NDKEvent) => {
      const aTime = a.created_at || 0;
      const bTime = b.created_at || 0;
      return bTime - aTime;
    };

    labeled.sort(sortByCreatedAt);
    topLevel.sort(sortByCreatedAt);
    rest.sort(sortByCreatedAt);

    console.debug(`[PublicationFeed] Sorted events by relevance: ${labeled.length} labeled, ${topLevel.length} top-level, ${rest.length} rest`);

    // Return in order: labeled, top-level, rest
    return [...labeled, ...topLevel, ...rest];
  };

  // Alias for search results (same function)
  const sortSearchResultsByRelevance = sortEventsByRelevance;


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
  // AI-NOTE: Search should work on all 30040s, not just the filtered display set
  const filterEventsBySearch = (events: NDKEvent[]) => {
    if (!props.searchQuery) return events;
    const query = props.searchQuery.trim();
    console.debug(
      "[PublicationFeed] Filtering events with query:",
      query,
      "Total events before filter:",
      events.length,
    );

    // When searching, search through all 30040s
    const searchSource = allIndexEvents;

    // Check cache first for publication search
    const cachedResult = searchCache.get("publication", query);
    if (cachedResult) {
      console.log(
        `[PublicationFeed] Using cached results for publication search: ${query}`,
      );
      // Cached results are already sorted by relevance
      return cachedResult.events;
    }

    // AI-NOTE: Check if the query is a Nostr identifier (npub, hex, nprofile)
    const npub = convertToNpub(query);
    if (npub) {
      console.debug("[PublicationFeed] Query is a Nostr identifier, filtering by npub:", npub);
      let filtered = filterEventsByNpub(searchSource, npub);
      
      // Cache the filtered results (no sorting needed, source is already sorted)
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

    const filtered = searchSource.filter((event) => {
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

    // Cache the filtered results (no sorting needed, source is already sorted)
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
    console.debug("[PublicationFeed] Search query or filter changed:", query);
    
    // Filter to top-level events first
    let filtered = filterToTopLevelOnly(allIndexEvents);
    topLevelEventCount = filtered.length; // Update top-level count
    
    // Sort top-level events by relevance
    filtered = sortEventsByRelevance(filtered);
    
    // Apply user filter
    filtered = filterEventsByUser(filtered);
    
    // Then apply search filter if query exists (no sorting needed, already sorted)
    if (query && query.trim()) {
      filtered = filterEventsBySearch(filtered);
    }
    
    eventsInView = filtered.slice(0, publicationsToDisplay);
    endOfFeed = filtered.length <= publicationsToDisplay;
  }, 300);

  // AI-NOTE: Watch for changes in search query, user filter, and events
  // Triggers debounced search when any filter changes or events are loaded
  $effect(() => {
    // Only trigger if we have events (labels are already loaded from initializeAndFetch)
    if (allIndexEvents.length > 0 && !loading) {
      // Read reactive props to track them as dependencies (intentionally accessing them)
      props.searchQuery;
      props.showOnlyMyPublications;
      // Re-sort and filter when filters change (labels are already loaded)
      debouncedSearch(props.searchQuery);
    }
  });

  // AI-NOTE: Watch for user authentication state changes to re-fetch events when user logs in/out
  $effect(() => {
    const userState = $userStore;
    
    if (hasInitialized && userState.signedIn) {
      console.debug('[PublicationFeed] User signed in, checking if we need to re-fetch events');
      // Check if we have user-specific relays that we haven't fetched from yet
      const inboxRelays = $activeInboxRelays;
      const outboxRelays = $activeOutboxRelays;
      const userRelays = [...inboxRelays, ...outboxRelays];
      // Combine relays based on checkbox state
      const baseRelays = props.useFullRelaySet 
        ? [...secondaryRelays, ...searchRelays]
        : secondaryRelays;
      const feedRelays = [...new Set([...baseRelays, ...userRelays])];
      
      if (feedRelays.length > 0) {
        const currentRelaysString = allRelays.sort().join(',');
        const newRelaysString = feedRelays.sort().join(',');
        
        if (currentRelaysString !== newRelaysString) {
          console.debug('[PublicationFeed] User logged in with new feed relays, re-fetching events');
          // Clear cache to force fresh fetch from user's relays
          indexEventCache.clear();
          setTimeout(() => initializeAndFetch(), 0);
        }
      }
    }
  });


  // Emit event count updates (using top-level count as total)
  $effect(() => {
    if (props.onEventCountUpdate) {
      props.onEventCountUpdate({
        displayed: eventsInView.length,
        total: topLevelEventCount
      });
    }
  });

  async function loadMorePublications() {
    loadingMore = true;
    const current = eventsInView.length;
    
    // Filter to top-level events first
    let source = filterToTopLevelOnly(allIndexEvents);
    
    // Sort by relevance
    source = sortEventsByRelevance(source);
    
    // Apply user filter
    source = filterEventsByUser(source);
    
    // Then apply search filter if query exists
    if (props.searchQuery?.trim()) {
      source = filterEventsBySearch(source);
    }
    
    eventsInView = source.slice(0, current + publicationsToDisplay);
    endOfFeed = eventsInView.length >= source.length;
    loadingMore = false;
  }

  function getSkeletonIds(): string[] {
    // Only access window on client-side
    if (typeof window === 'undefined') {
      return ['skeleton-0', 'skeleton-1', 'skeleton-2']; // Default fallback for SSR
    }
    
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
            
            // Sort by relevance
            source = sortEventsByRelevance(source);
            
            // Apply user filter
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
        <Skeleton classes={{wrapper: "skeleton-leather w-full"}} size="lg" />
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
