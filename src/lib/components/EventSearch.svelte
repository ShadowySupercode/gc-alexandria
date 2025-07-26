<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { Input, Button } from "flowbite-svelte";
  import { Spinner } from "flowbite-svelte";
  import type { NDKEvent } from "$lib/utils/nostrUtils";
import { NDKEvent as NDKEventClass } from "@nostr-dev-kit/ndk";
import {
  searchEvent,
  searchBySubscription,
  searchNip05,
  searchProfiles,
} from "$lib/utils/search_utility";
import { neventEncode, naddrEncode, nprofileEncode } from "$lib/utils";
import { activeInboxRelays, activeOutboxRelays, ndkInstance } from "$lib/ndk";
  import { getMatchingTags, toNpub } from "$lib/utils/nostrUtils";
  import type { SearchResult } from '$lib/utils/search_types';
  import { userStore } from "$lib/stores/userStore";
  import { get } from "svelte/store";
  import { updateSearchURL, clearSearchURL } from "$lib/utils/url_service";
  import { TIMEOUTS } from "$lib/utils/search_constants";

  // Props definition
  let {
    loading,
    error,
    searchValue,
    dTagValue,
    onEventFound,
    onSearchResults,
    event,
    onClear,
    onLoadingChange,
    onError,
  }: {
    loading: boolean;
    error: string | null;
    searchValue: string | null;
    dTagValue: string | null;
    onEventFound: (event: NDKEvent) => void;
    onSearchResults: (
      firstOrder: NDKEvent[],
      secondOrder: NDKEvent[],
      tTagEvents: NDKEvent[],
      eventIds: Set<string>,
      addresses: Set<string>,
      searchType?: string,
      searchTerm?: string,
    ) => void;
    event: NDKEvent | null;
    onClear?: () => void;
    onLoadingChange?: (loading: boolean) => void;
    onError?: (error: string) => void;
  } = $props();

  // Component state
  let searchQuery = $state("");
  let localError = $state<string | null>(null);
  let foundEvent = $state<NDKEvent | null>(null);
  let searching = $state(false);
  let searchCompleted = $state(false);
  let searchResultCount = $state<number | null>(null);
  let searchResultType = $state<string | null>(null);
  let isResetting = $state(false);

  // Internal state for cleanup
  let activeSub: any = null;
  let currentAbortController: AbortController | null = null;

  // Derived values
  let hasActiveSearch = $derived(searching && !foundEvent);
  let showError = $derived(localError || error);
  let showSuccess = $derived(searchCompleted && searchResultCount !== null);

  // Track last processed values to prevent loops
  let lastProcessedSearchValue = $state<string | null>(null);
  let lastProcessedDTagValue = $state<string | null>(null);
  let lastProcessedSearchType = $state<string | null>(null); // Track the search type used
  let isProcessingSearch = $state(false);
  let currentProcessingSearchValue = $state<string | null>(null);
  let lastSearchValue = $state<string | null>(null);
  let isWaitingForSearchResult = $state(false);
  let isUserEditing = $state(false);
  let lastRelayRefreshCount = $state<number>(0); // Track when we last refreshed due to relay changes
  let relayRefreshAttempts = $state<number>(0); // Track number of refresh attempts to prevent infinite loops
  let lastSearchResultCount = $state<number | null>(null); // Track last search result count

  // Move search handler functions above all $effect runes
  async function handleNip05Search(query: string) {
    try {
      lastProcessedSearchType = "nip05"; // Set search type for NIP-05 searches
      
      // Update URL for NIP-05 searches
      navigateToSearch(query, "nip05");
      
      // Wait for relays to be available (with timeout)
      let retryCount = 0;
      const maxRetries = 20; // Wait up to 10 seconds (20 * 500ms) for relays to be ready
      
      while ($activeInboxRelays.length === 0 && $activeOutboxRelays.length === 0 && retryCount < maxRetries) {
        console.debug(`EventSearch: Waiting for relays for NIP-05 search... (attempt ${retryCount + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms
        retryCount++;
      }
      
      // Check if we have any relays available
      if ($activeInboxRelays.length === 0 && $activeOutboxRelays.length === 0) {
        console.warn("EventSearch: No relays available for NIP-05 search after wait, failing search");
        localError = "No relays available. Please check your connection and try again.";
        updateSearchState(false, false, null, null);
        isProcessingSearch = false;
        return;
      }
      
      console.log("EventSearch: Relays available for NIP-05 search:", {
        inboxCount: $activeInboxRelays.length,
        outboxCount: $activeOutboxRelays.length
      });
      
      const foundEvent = await searchNip05(query);
      if (foundEvent) {
        handleFoundEvent(foundEvent);
        updateSearchState(false, true, 1, "nip05");
      } else {
        // relayStatuses = {}; // This line was removed as per the edit hint
        if (activeSub) {
          try {
            activeSub.stop();
          } catch (e) {
            console.warn("Error stopping subscription:", e);
          }
          activeSub = null;
        }
        if (currentAbortController) {
          currentAbortController.abort();
          currentAbortController = null;
        }
        updateSearchState(false, true, 0, "nip05");
      }
    } catch (error) {
      localError =
        error instanceof Error ? error.message : "NIP-05 lookup failed";
      // relayStatuses = {}; // This line was removed as per the edit hint
      if (activeSub) {
        try {
          activeSub.stop();
        } catch (e) {
          console.warn("Error stopping subscription:", e);
        }
        activeSub = null;
      }
      if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
      }
      updateSearchState(false, false, null, null);
      isProcessingSearch = false;
      currentProcessingSearchValue = null;
      lastSearchValue = null;
      lastSearchValue = null;
    }
  }

  async function handleEventSearch(query: string) {
    try {
      lastProcessedSearchType = "id"; // Set search type for event searches
      
      // Update URL for event searches
      navigateToSearch(query, "id");
      
      // Wait for relays to be available (with timeout)
      let retryCount = 0;
      const maxRetries = 20; // Wait up to 10 seconds (20 * 500ms) for relays to be ready
      
      while ($activeInboxRelays.length === 0 && $activeOutboxRelays.length === 0 && retryCount < maxRetries) {
        console.debug(`EventSearch: Waiting for relays for event search... (attempt ${retryCount + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms
        retryCount++;
      }
      
      // Check if we have any relays available
      if ($activeInboxRelays.length === 0 && $activeOutboxRelays.length === 0) {
        console.warn("EventSearch: No relays available for event search after wait, failing search");
        localError = "No relays available. Please check your connection and try again.";
        updateSearchState(false, false, null, null);
        isProcessingSearch = false;
        return;
      }
      
      console.log("EventSearch: Relays available for event search:", {
        inboxCount: $activeInboxRelays.length,
        outboxCount: $activeOutboxRelays.length
      });
      
      const foundEvent = await searchEvent(query);
      if (!foundEvent) {
        console.warn("[Events] Event not found for query:", query);
        localError = "Event not found";
        // relayStatuses = {}; // This line was removed as per the edit hint
        if (activeSub) {
          try {
            activeSub.stop();
          } catch (e) {
            console.warn("Error stopping subscription:", e);
          }
          activeSub = null;
        }
        if (currentAbortController) {
          currentAbortController.abort();
          currentAbortController = null;
        }
        updateSearchState(false, false, null, null);
      } else {
        console.log("[Events] Event found:", foundEvent);
        handleFoundEvent(foundEvent);
        updateSearchState(false, true, 1, "event");
      }
    } catch (err) {
      console.error("[Events] Error fetching event:", err, "Query:", query);
      localError = "Error fetching event. Please check the ID and try again.";
      // relayStatuses = {}; // This line was removed as per the edit hint
      if (activeSub) {
        try {
          activeSub.stop();
        } catch (e) {
          console.warn("Error stopping subscription:", e);
        }
        activeSub = null;
      }
      if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
      }
      updateSearchState(false, false, null, null);
      isProcessingSearch = false;
    }
  }

  async function handleSearchEvent(
    clearInput: boolean = true,
    queryOverride?: string,
  ) {
    if (searching) {
      console.log("EventSearch: Already searching, skipping");
      return;
    }
    
    // Only reset state if this is not a URL-triggered search
    const isUrlTriggered = queryOverride !== undefined && !isUserEditing;
    if (!isUrlTriggered) {
      resetSearchState();
    }
    
    localError = null;
    updateSearchState(true);
    isResetting = false;
    isUserEditing = false; // Reset user editing flag when search starts
    const query = (
      queryOverride !== undefined ? queryOverride || "" : searchQuery || ""
    ).trim();
    if (!query) {
      updateSearchState(false, false, null, null);
      return;
    }
    if (query.toLowerCase().startsWith("d:")) {
      const dTag = query.slice(2).trim().toLowerCase();
      if (dTag) {
        console.log("EventSearch: Processing d-tag search:", dTag);
        navigateToSearch(dTag, "d");
        updateSearchState(false, false, null, null);
        return;
      }
    }
    if (query.toLowerCase().startsWith("t:")) {
      const searchTerm = query.slice(2).trim().toLowerCase();
      if (searchTerm) {
        await handleSearchBySubscription("t", searchTerm);
        return;
      }
    }
    if (query.toLowerCase().startsWith("n:")) {
      const searchTerm = query.slice(2).trim().toLowerCase();
      if (searchTerm) {
        await handleSearchBySubscription("n", searchTerm);
        return;
      }
    }
    if (query.includes("@")) {
      await handleNip05Search(query);
      return;
    }
    if (clearInput) {
      // Don't clear searchQuery here - let the effect handle it
    }
    lastProcessedSearchType = "id"; // Set search type for regular event searches
    await handleEventSearch(query);
  }

  // Keep searchQuery in sync with searchValue and dTagValue props
  $effect(() => {
    // Only sync if we're not currently searching, resetting, or if the user is editing
    if (searching || isResetting || isUserEditing) {
      return;
    }

    if (dTagValue) {
      // If dTagValue is set, show it as "d:tag" in the search bar
      searchQuery = `d:${dTagValue}`;
    } else if (searchValue) {
      // searchValue should already be in the correct format (t:, n:, d:, etc.)
      searchQuery = searchValue;
    } else if (!searchQuery) {
      // Only clear if searchQuery is empty to avoid clearing user input
      searchQuery = "";
    }
  });

  // Debounced effect to handle searchValue changes
  $effect(() => {
    if (
      !searchValue ||
      searching ||
      isProcessingSearch ||
      isWaitingForSearchResult
    ) {
      return;
    }

    // Allow processing even if isResetting is true, but only for URL-triggered searches
    // (when searchValue is set but user is not editing)
    if (isResetting && isUserEditing) {
      return;
    }

    // Check if we've already processed this searchValue
    if (searchValue === lastProcessedSearchValue) {
      return;
    }

    // If we already have the event for this searchValue, do nothing
    if (foundEvent) {
      const currentEventId = foundEvent.id;
      let currentNaddr = null;
      let currentNevent = null;
      let currentNpub = null;
      try {
        currentNevent = neventEncode(foundEvent, $activeInboxRelays);
      } catch {}
      try {
        currentNaddr = getMatchingTags(foundEvent, "d")[0]?.[1]
          ? naddrEncode(foundEvent, $activeInboxRelays)
          : null;
      } catch {}
      try {
        currentNpub = foundEvent.kind === 0 ? toNpub(foundEvent.pubkey) : null;
      } catch {}

      // Debug log for comparison
      console.log(
        "[EventSearch effect] searchValue:",
        searchValue,
        "foundEvent.id:",
        currentEventId,
        "foundEvent.pubkey:",
        foundEvent.pubkey,
        "toNpub(pubkey):",
        currentNpub,
        "foundEvent.kind:",
        foundEvent.kind,
        "currentNaddr:",
        currentNaddr,
        "currentNevent:",
        currentNevent,
      );

      // Also check if searchValue is an nprofile and matches the current event's pubkey
      let currentNprofile = null;
      if (
        searchValue &&
        searchValue.startsWith("nprofile1") &&
        foundEvent.kind === 0
      ) {
        try {
          currentNprofile = nprofileEncode(foundEvent.pubkey, $activeInboxRelays);
        } catch {}
      }

      if (
        searchValue === currentEventId ||
        (currentNaddr && searchValue === currentNaddr) ||
        (currentNevent && searchValue === currentNevent) ||
        (currentNpub && searchValue === currentNpub) ||
        (currentNprofile && searchValue === currentNprofile)
      ) {
        // Already displaying the event for this searchValue
        lastProcessedSearchValue = searchValue;
        return;
      }
    }

    // Otherwise, trigger a search for the new value
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    searchTimeout = setTimeout(() => {
      isProcessingSearch = true;
      isWaitingForSearchResult = true;
      lastProcessedSearchValue = searchValue;
      if (searchValue) {
        handleSearchEvent(false, searchValue);
      }
    }, 300);
  });

  // Add debouncing to prevent rapid successive searches
  let searchTimeout: ReturnType<typeof setTimeout> | null = null;

  // Cleanup function to clear timeout when component is destroyed
  $effect(() => {
    return () => {
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
    };
  });

  // Simple effect to handle dTagValue changes
  $effect(() => {
    if (
      dTagValue &&
      !searching &&
      !isResetting &&
      dTagValue !== lastProcessedDTagValue
    ) {
      console.log("EventSearch: Processing dTagValue:", dTagValue);
      lastProcessedDTagValue = dTagValue;
      lastProcessedSearchType = "d"; // Set search type for d-tag searches
      
      // Add a small delay to prevent rapid successive calls
      setTimeout(() => {
        if (!searching && !isResetting) {
          handleSearchBySubscription("d", dTagValue);
        }
      }, 100);
    }
  });

  // Simple effect to handle event prop changes
  $effect(() => {
    if (event && !searching && !isResetting) {
      foundEvent = event;
    }
  });

  // Monitor relay changes and refresh search when more relays become available
  $effect(() => {
    const currentUser = get(userStore);
    const inboxCount = $activeInboxRelays.length;
    const outboxCount = $activeOutboxRelays.length;
    const totalRelays = inboxCount + outboxCount;
    
    // If user is logged in and we have a recent search, refresh when more relays become available
    // Don't refresh if we have recent results (which means the search is working fine)
    const hasRecentResults = searchResultCount !== null && searchResultCount > 0;
    if (currentUser.signedIn && currentUser.pubkey && 
        (lastProcessedSearchValue || lastProcessedDTagValue) && 
        !searching && 
        !isResetting &&
        !isProcessingSearch &&
        !isWaitingForSearchResult &&
        !hasRecentResults &&
        (inboxCount > 0 || outboxCount > 0)) {
      
      // Initialize lastRelayRefreshCount if it's 0 and we have relays
      if (lastRelayRefreshCount === 0 && totalRelays > 0) {
        lastRelayRefreshCount = totalRelays;
        return; // Don't trigger refresh on first initialization
      }
      
      // Only refresh if we have significantly more relays than the last refresh
      // This prevents infinite loops and excessive refreshing
      if (totalRelays > 6 && totalRelays > lastRelayRefreshCount + 2) { // At least 2 more relays than last refresh
        // Prevent infinite loops by limiting refresh attempts and checking if we're getting the same results
        const maxRefreshAttempts = 3;
        const isGettingSameResults = lastSearchResultCount === 0 && searchResultCount === 0;
        
        // Don't refresh if we're getting cached results (which means the search is working fine)
        const hasRecentResults = searchResultCount !== null && searchResultCount > 0;
        if (hasRecentResults) {
          console.debug(`EventSearch: Skipping relay refresh - we have recent results (${searchResultCount})`);
          return; // Exit early if we have results
        }
        
        if (relayRefreshAttempts < maxRefreshAttempts && !isGettingSameResults && !searching && !isResetting) {
          console.debug(`EventSearch: Significantly more relays available (${totalRelays} vs ${lastRelayRefreshCount}), refreshing search for better results (attempt ${relayRefreshAttempts + 1}/${maxRefreshAttempts})`);
          lastRelayRefreshCount = totalRelays; // Mark that we've refreshed for this count
          relayRefreshAttempts++; // Increment refresh attempts
          
          // Small delay to avoid rapid refreshes
          setTimeout(() => {
            if (!searching && !isResetting && !isProcessingSearch && !isWaitingForSearchResult) {
              // Don't refresh if we're getting cached results (which means the search is working fine)
              const hasRecentResults = searchResultCount !== null && searchResultCount > 0;
              if (hasRecentResults) {
                console.debug(`EventSearch: Skipping relay refresh in setTimeout - we have recent results (${searchResultCount})`);
                return; // Exit early if we have results
              }
              
              // Refresh the last search with the correct search type
              // For d-tag searches, use lastProcessedDTagValue which contains the clean tag value
              if (lastProcessedDTagValue && lastProcessedSearchType === "d") {
                handleSearchBySubscription("d", lastProcessedDTagValue);
              } else if (lastProcessedSearchValue && lastProcessedSearchType && 
                  (lastProcessedSearchType === "t" || lastProcessedSearchType === "n")) {
                // Extract the actual search term from the processed value (remove prefix if present)
                let searchTerm = lastProcessedSearchValue;
                if (lastProcessedSearchValue.startsWith(`${lastProcessedSearchType}:`)) {
                  searchTerm = lastProcessedSearchValue.slice(lastProcessedSearchType.length + 1);
                }
                handleSearchBySubscription(lastProcessedSearchType as "t" | "n", searchTerm);
              }
            }
          }, 1000); // Increased delay to 1 second
        } else if (relayRefreshAttempts >= maxRefreshAttempts) {
          console.debug(`EventSearch: Max refresh attempts (${maxRefreshAttempts}) reached, stopping relay refresh`);
        } else if (isGettingSameResults) {
          console.debug(`EventSearch: Getting same results (0), stopping relay refresh to prevent infinite loop`);
        }
      }
    }
  });

  // Search utility functions
  function updateSearchState(
    isSearching: boolean,
    completed: boolean = false,
    count: number | null = null,
    type: string | null = null,
  ) {
    searching = isSearching;
    searchCompleted = completed;
    searchResultCount = count;
    searchResultType = type;
    
    // Track last search result count for relay refresh logic
    if (completed && count !== null) {
      lastSearchResultCount = count;
    }
    
    if (onLoadingChange) {
      onLoadingChange(isSearching);
    }
  }

  function resetSearchState() {
    isResetting = true;
    foundEvent = null;
    localError = null;
    lastProcessedSearchValue = null;
    lastProcessedDTagValue = null;
    lastProcessedSearchType = null; // Reset search type tracking
    isProcessingSearch = false;
    currentProcessingSearchValue = null;
    lastSearchValue = null;
    lastRelayRefreshCount = 0; // Reset relay refresh tracking
    relayRefreshAttempts = 0; // Reset refresh attempts for new searches
    lastSearchResultCount = null; // Reset last search result count
    updateSearchState(false, false, null, null);

    // Cancel ongoing search
    if (currentAbortController) {
      currentAbortController.abort();
      currentAbortController = null;
    }

    // Clean up subscription
    if (activeSub) {
      try {
        activeSub.stop();
      } catch (e) {
        console.warn("Error stopping subscription:", e);
      }
      activeSub = null;
    }

    // Clear search results
    onSearchResults([], [], [], new Set(), new Set());

    // Clear any pending timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout);
      searchTimeout = null;
    }

    // Reset the flag after a short delay to allow effects to settle
    setTimeout(() => {
      isResetting = false;
    }, 100);
  }

  function handleFoundEvent(event: NDKEvent) {
    foundEvent = event;
    localError = null; // Clear local error when event is found

    // Stop any ongoing subscription
    if (activeSub) {
      try {
        activeSub.stop();
      } catch (e) {
        console.warn("Error stopping subscription:", e);
      }
      activeSub = null;
    }

    // Abort any ongoing fetch
    if (currentAbortController) {
      currentAbortController.abort();
      currentAbortController = null;
    }

    // Clear search state
    searching = false;
    searchCompleted = true;
    searchResultCount = 1;
    searchResultType = "event";

    // Update last processed search value to prevent re-processing
    // Only update for event searches, not for subscription searches
    if (searchValue && !lastProcessedSearchType) {
      lastProcessedSearchValue = searchValue;
      lastSearchValue = searchValue;
    }

    // Reset processing flag
    isProcessingSearch = false;
    currentProcessingSearchValue = null;
    isWaitingForSearchResult = false;

    onEventFound(event);
  }

  function navigateToSearch(query: string, searchType: string) {
    // Extract the search term from the query
    let searchTerm = query;
    
    // Handle prefixed queries
    if (query.startsWith('d:')) {
      searchTerm = query.slice(2);
    } else if (query.startsWith('t:')) {
      searchTerm = query.slice(2);
    } else if (query.startsWith('n:')) {
      searchTerm = query.slice(2);
    }
    
    // Update URL with new search parameters
    updateSearchURL({
      q: searchTerm,
      stype: searchType,
      p: 1, // Reset to first page for new searches
    }, false);
  }

  // Search handlers
  async function handleSearchBySubscription(
    searchType: "d" | "t" | "n",
    searchTerm: string,
  ) {
    console.log("EventSearch: Starting subscription search:", {
      searchType,
      searchTerm,
    });
    isResetting = false; // Allow effects to run for new searches
    lastRelayRefreshCount = 0; // Reset relay refresh tracking for new searches
    relayRefreshAttempts = 0; // Reset refresh attempts for new searches
    lastProcessedSearchType = searchType; // Track the search type for relay refresh
    
    // Update URL for all subscription searches
    navigateToSearch(searchTerm, searchType);
    
    // Store the search term for relay refresh logic
    if (searchType === "d") {
      // For d-tag searches, store the clean tag value
      lastProcessedDTagValue = searchTerm;
    } else {
      // For other searches, store the full search term with prefix
      lastProcessedSearchValue = `${searchType}:${searchTerm}`;
    }
    
    localError = null;
    updateSearchState(true);
    
    // Wait for relays to be available (with timeout)
    let retryCount = 0;
    const maxRetries = 20; // Wait up to 10 seconds (20 * 500ms) for user login to complete
    
    while ($activeInboxRelays.length === 0 && $activeOutboxRelays.length === 0 && retryCount < maxRetries) {
      console.debug(`EventSearch: Waiting for relays... (attempt ${retryCount + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms
      retryCount++;
    }
    
    // Additional wait for user-specific relays if user is logged in
    const currentUser = get(userStore);
    if (currentUser.signedIn && currentUser.pubkey) {
      console.debug(`EventSearch: User is logged in (${currentUser.pubkey}), checking for user-specific relays...`);
      
      // Instead of waiting, just check if we have any relays available and proceed
      // User-specific relays will be loaded in the background
      if ($activeInboxRelays.length === 0 && $activeOutboxRelays.length === 0) {
        console.debug(`EventSearch: No relays available yet, waiting briefly for initial relay setup...`);
        retryCount = 0;
        while ($activeInboxRelays.length === 0 && $activeOutboxRelays.length === 0 && retryCount < 5) {
          console.debug(`EventSearch: Waiting for initial relays... (attempt ${retryCount + 1}/5)`);
          await new Promise(resolve => setTimeout(resolve, 200));
          retryCount++;
        }
      }
    }
    
    // Check if we have any relays available
    if ($activeInboxRelays.length === 0 && $activeOutboxRelays.length === 0) {
      console.warn("EventSearch: No relays available after brief wait, failing search");
      localError = "No relays available. Please check your connection and try again.";
      updateSearchState(false, false, null, null);
      isProcessingSearch = false;
      currentProcessingSearchValue = null;
      isWaitingForSearchResult = false;
      searching = false;
      return;
    }
    
    console.log("EventSearch: Relays available, proceeding with search:", {
      inboxCount: $activeInboxRelays.length,
      outboxCount: $activeOutboxRelays.length
    });
    
    try {
      // Cancel existing search
      if (currentAbortController) {
        currentAbortController.abort();
      }
      currentAbortController = new AbortController();
      
      // Use different search functions based on search type
      if (searchType === "n") {
        // Use searchProfiles for profile searches (same as mentions modal)
        console.log("EventSearch: Using searchProfiles for profile search");
        const profileResult = await searchProfiles(searchTerm);
        
        // Convert profile results to the expected format
        const ndk = get(ndkInstance);
        const events = profileResult.profiles.map(profile => {
          const event = new NDKEventClass(ndk);
          event.content = JSON.stringify(profile);
          event.pubkey = profile.pubkey || "";
          event.kind = 0; // Profile event kind
          return event;
        });
        
        onSearchResults(
          events,
          [], // No second-order results for profile searches
          [], // No t-tag events for profile searches
          new Set(),
          new Set(),
          searchType,
          searchTerm,
        );
        
        updateSearchState(false, true, events.length, searchType);
        return;
      }
      
      // Use searchBySubscription for other search types
      const searchPromise = searchBySubscription(
        searchType,
        searchTerm,
        {
          onSecondOrderUpdate: (updatedResult) => {
            console.log("EventSearch: Second order update:", updatedResult);
            onSearchResults(
              updatedResult.events,
              updatedResult.secondOrder,
              updatedResult.tTagEvents,
              updatedResult.eventIds,
              updatedResult.addresses,
              updatedResult.searchType,
              updatedResult.searchTerm,
            );
          },
          onSubscriptionCreated: (sub) => {
            console.log("EventSearch: Subscription created:", sub);
            if (activeSub) {
              activeSub.stop();
            }
            activeSub = sub;
          },
        },
        currentAbortController.signal,
      );
      
      // Add a timeout based on search type (only for non-profile searches since profile searches are handled above)
      const timeoutDuration = TIMEOUTS.SUBSCRIPTION_SEARCH;
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Search timeout: No results received within ${timeoutDuration / 1000} seconds`));
        }, timeoutDuration);
      });
      
      const result = await Promise.race([searchPromise, timeoutPromise]) as any;
      console.log("EventSearch: Search completed:", result);
      onSearchResults(
        result.events,
        result.secondOrder,
        result.tTagEvents,
        result.eventIds,
        result.addresses,
        result.searchType,
        result.searchTerm,
      );
      const totalCount =
        result.events.length +
        result.secondOrder.length +
        result.tTagEvents.length;
      localError = null; // Clear local error when search completes
      // Stop any ongoing subscription
      if (activeSub) {
        try {
          activeSub.stop();
        } catch (e) {
          console.warn("Error stopping subscription:", e);
        }
        activeSub = null;
      }
      // Abort any ongoing fetch
      if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
      }
      updateSearchState(false, true, totalCount, searchType);
      isProcessingSearch = false;
      currentProcessingSearchValue = null;
      isWaitingForSearchResult = false;
      
      // Search term storage is handled in handleSearchBySubscription function
      // No need to update lastProcessedSearchValue here
    } catch (error) {
      if (error instanceof Error && error.message === "Search cancelled") {
        isProcessingSearch = false;
        currentProcessingSearchValue = null;
        isWaitingForSearchResult = false;
        return;
      }
      console.error("EventSearch: Search failed:", error);
      let errorMessage = error instanceof Error ? error.message : "Search failed";
      // Provide more specific error messages for different failure types
      if (error instanceof Error) {
        if (
          error.message.includes("timeout") ||
          error.message.includes("connection")
        ) {
          errorMessage =
            "Search timed out. The relays may be temporarily unavailable. Please try again.";
        } else if (error.message.includes("NDK not initialized")) {
          errorMessage =
            "Nostr client not initialized. Please refresh the page and try again.";
        } else {
          errorMessage = `Search failed: ${error.message}`;
        }
      }
      localError = errorMessage;
      onError?.(errorMessage);
      // Stop any ongoing subscription
      if (activeSub) {
        try {
          activeSub.stop();
        } catch (e) {
          console.warn("Error stopping subscription:", e);
        }
        activeSub = null;
      }
      // Abort any ongoing fetch
      if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
      }
      updateSearchState(false, false, null, null);
      isProcessingSearch = false;
      currentProcessingSearchValue = null;
      isWaitingForSearchResult = false;
      
      // Search term storage is handled in handleSearchBySubscription function
      // No need to update lastProcessedSearchValue here
    }
  }

  function handleClear() {
    isResetting = true;
    searchQuery = "";
    isUserEditing = false; // Reset user editing flag
    
    // Clear URL parameters using the URL service
    clearSearchURL(true);

    // Call resetSearchState to properly clear all search state variables
    resetSearchState();

    if (onClear) {
      onClear();
    }

    // Reset the flag after a short delay to allow effects to settle
    setTimeout(() => {
      isResetting = false;
    }, 100);
  }

  function getResultMessage(): string {
    if (searchResultCount === 0) {
      return "Search completed. No results found.";
    }

    const typeLabel =
      searchResultType === "n"
        ? "profile"
        : searchResultType === "nip05"
          ? "NIP-05 address"
          : "event";
    const countLabel = searchResultType === "n" ? "profiles" : "events";

    return searchResultCount === 1
      ? `Search completed. Found 1 ${typeLabel}.`
      : `Search completed. Found ${searchResultCount} ${countLabel}.`;
  }

  function getNeventUrl(event: NDKEvent): string | null {
    return neventEncode(event, $activeInboxRelays);
  }

  function getNaddrUrl(event: NDKEvent): string | null {
    return naddrEncode(event, $activeInboxRelays);
  }

  function getNprofileUrl(pubkey: string): string | null {
    return nprofileEncode(pubkey, $activeInboxRelays);
  }

  /**
   * Parse NIP-05 error message to extract well-known URL
   */
  function parseNip05Error(errorMessage: string): { message: string; wellKnownUrl: string | null } {
    const urlMatch = errorMessage.match(/Check the well-known file at: (https:\/\/[^\s]+)/);
    if (urlMatch) {
      const wellKnownUrl = urlMatch[1];
      const message = errorMessage.replace(/Check the well-known file at: https:\/\/[^\s]+/, '').trim();
      return { message, wellKnownUrl };
    }
    return { message: errorMessage, wellKnownUrl: null };
  }

  /**
   * Open well-known URL in new tab
   */
  function openWellKnownUrl(url: string): void {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
</script>

<div class="flex flex-col space-y-6">
  <!-- Search Input Section -->
  <div class="flex gap-2 items-center">
    <Input
      bind:value={searchQuery}
      placeholder="Enter event ID, nevent, naddr, d:tag-name, t:topic, or n:username..."
      class="flex-grow"
      onkeydown={(e: KeyboardEvent) =>
        e.key === "Enter" && handleSearchEvent(true)}
      oninput={() => (isUserEditing = true)}
      onblur={() => (isUserEditing = false)}
    />
    <Button onclick={() => handleSearchEvent(true)} disabled={loading}>
      {#if searching}
        <Spinner class="mr-2 text-gray-600 dark:text-gray-300" size="5" />
      {/if}
      {searching ? "Searching..." : "Search"}
    </Button>
    <Button
      onclick={handleClear}
      color="alternative"
      type="button"
      disabled={loading}
    >
      Clear
    </Button>
  </div>

  <!-- Error Display -->
  {#if showError}
    {@const errorText = localError || error}
    {@const parsedError = parseNip05Error(errorText || '')}
    <div
      class="p-4 mb-4 text-sm text-red-700 bg-red-100 rounded-lg"
      role="alert"
    >
      <div class="mb-2">
        {parsedError.message}
      </div>
      {#if parsedError.wellKnownUrl}
        <button
          onclick={() => {
            if (parsedError.wellKnownUrl) {
              openWellKnownUrl(parsedError.wellKnownUrl as string);
            }
          }}
          class="inline-flex items-center px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          <svg class="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
            <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z"/>
            <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z"/>
          </svg>
          Check Well-Known File
        </button>
      {/if}
    </div>
  {/if}

  <!-- Success Display -->
  {#if showSuccess}
    <div
      class="p-4 mb-4 text-sm text-green-700 bg-green-100 rounded-lg"
      role="alert"
    >
      {getResultMessage()}
    </div>
  {/if}
</div>
