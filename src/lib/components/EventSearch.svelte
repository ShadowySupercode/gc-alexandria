<script lang="ts">
  import { Input, Button } from "flowbite-svelte";
  import { Spinner } from "flowbite-svelte";
  import { goto } from "$app/navigation";
  import type { NDKEvent } from "$lib/utils/nostrUtils";
  import RelayDisplay from "./RelayDisplay.svelte";
  import { searchEvent, searchBySubscription, searchNip05 } from "$lib/utils/search_utility";
  import { neventEncode, naddrEncode, nprofileEncode } from "$lib/utils";
  import { standardRelays } from "$lib/consts";
  import { getMatchingTags, toNpub } from "$lib/utils/nostrUtils";

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
      searchTerm?: string
    ) => void;
    event: NDKEvent | null;
    onClear?: () => void;
    onLoadingChange?: (loading: boolean) => void;
  } = $props();

  // Component state
  let searchQuery = $state("");
  let localError = $state<string | null>(null);
  let relayStatuses = $state<Record<string, "pending" | "found" | "notfound">>({});
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
  let hasActiveSearch = $derived(searching || (Object.values(relayStatuses).some(s => s === "pending") && !foundEvent));
  let showError = $derived(localError || error);
  let showSuccess = $derived(searchCompleted && searchResultCount !== null);

  // Track last processed values to prevent loops
  let lastProcessedSearchValue = $state<string | null>(null);
  let lastProcessedDTagValue = $state<string | null>(null);
  let isProcessingSearch = $state(false);
  let currentProcessingSearchValue = $state<string | null>(null);
  let lastSearchValue = $state<string | null>(null);
  let isWaitingForSearchResult = $state(false);
  let isUserEditing = $state(false);

  // Move search handler functions above all $effect runes
  async function handleNip05Search(query: string) {
    try {
      const foundEvent = await searchNip05(query);
      if (foundEvent) {
        handleFoundEvent(foundEvent);
        updateSearchState(false, true, 1, 'nip05');
      } else {
        relayStatuses = {};
        if (activeSub) { try { activeSub.stop(); } catch (e) { console.warn('Error stopping subscription:', e); } activeSub = null; }
        if (currentAbortController) { currentAbortController.abort(); currentAbortController = null; }
        updateSearchState(false, true, 0, 'nip05');
      }
    } catch (error) {
      localError = error instanceof Error ? error.message : 'NIP-05 lookup failed';
      relayStatuses = {};
      if (activeSub) { try { activeSub.stop(); } catch (e) { console.warn('Error stopping subscription:', e); } activeSub = null; }
      if (currentAbortController) { currentAbortController.abort(); currentAbortController = null; }
      updateSearchState(false, false, null, null);
      isProcessingSearch = false;
      currentProcessingSearchValue = null;
      lastSearchValue = null;
      lastSearchValue = null;
    }
  }

  async function handleEventSearch(query: string) {
    try {
      const foundEvent = await searchEvent(query);
      if (!foundEvent) {
        console.warn("[Events] Event not found for query:", query);
        localError = "Event not found";
        relayStatuses = {};
        if (activeSub) { try { activeSub.stop(); } catch (e) { console.warn('Error stopping subscription:', e); } activeSub = null; }
        if (currentAbortController) { currentAbortController.abort(); currentAbortController = null; }
        updateSearchState(false, false, null, null);
      } else {
        console.log("[Events] Event found:", foundEvent);
        handleFoundEvent(foundEvent);
        updateSearchState(false, true, 1, 'event');
      }
    } catch (err) {
      console.error("[Events] Error fetching event:", err, "Query:", query);
      localError = "Error fetching event. Please check the ID and try again.";
      relayStatuses = {};
      if (activeSub) { try { activeSub.stop(); } catch (e) { console.warn('Error stopping subscription:', e); } activeSub = null; }
      if (currentAbortController) { currentAbortController.abort(); currentAbortController = null; }
      updateSearchState(false, false, null, null);
      isProcessingSearch = false;
    }
  }

  async function handleSearchEvent(clearInput: boolean = true, queryOverride?: string) {
    if (searching) {
      console.log("EventSearch: Already searching, skipping");
      return;
    }
    resetSearchState();
    localError = null;
    updateSearchState(true);
    isResetting = false;
    isUserEditing = false; // Reset user editing flag when search starts
    const query = (queryOverride !== undefined ? queryOverride : searchQuery).trim();
    if (!query) {
      updateSearchState(false, false, null, null);
      return;
    }
    if (query.toLowerCase().startsWith("d:")) {
      const dTag = query.slice(2).trim().toLowerCase();
      if (dTag) {
        console.log("EventSearch: Processing d-tag search:", dTag);
        navigateToSearch(dTag, 'd');
        updateSearchState(false, false, null, null);
        return;
      }
    }
    if (query.toLowerCase().startsWith("t:")) {
      const searchTerm = query.slice(2).trim();
      if (searchTerm) {
        await handleSearchBySubscription('t', searchTerm);
        return;
      }
    }
    if (query.toLowerCase().startsWith("n:")) {
      const searchTerm = query.slice(2).trim();
      if (searchTerm) {
        await handleSearchBySubscription('n', searchTerm);
        return;
      }
    }
    if (query.includes('@')) {
      await handleNip05Search(query);
      return;
    }
    if (clearInput) {
      navigateToSearch(query, 'id');
      // Don't clear searchQuery here - let the effect handle it
    }
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
    if (!searchValue || searching || isResetting || isProcessingSearch || isWaitingForSearchResult) {
      return;
    }

    // If we already have the event for this searchValue, do nothing
    if (foundEvent) {
      const currentEventId = foundEvent.id;
      let currentNaddr = null;
      let currentNevent = null;
      let currentNpub = null;
      try {
        currentNevent = neventEncode(foundEvent, standardRelays);
      } catch {}
      try {
        currentNaddr = getMatchingTags(foundEvent, 'd')[0]?.[1]
          ? naddrEncode(foundEvent, standardRelays)
          : null;
      } catch {}
      try {
        currentNpub = foundEvent.kind === 0 ? toNpub(foundEvent.pubkey) : null;
      } catch {}

      // Debug log for comparison
      console.log('[EventSearch effect] searchValue:', searchValue, 'foundEvent.id:', currentEventId, 'foundEvent.pubkey:', foundEvent.pubkey, 'toNpub(pubkey):', currentNpub, 'foundEvent.kind:', foundEvent.kind, 'currentNaddr:', currentNaddr, 'currentNevent:', currentNevent);

      // Also check if searchValue is an nprofile and matches the current event's pubkey
      let currentNprofile = null;
      if (searchValue && searchValue.startsWith('nprofile1') && foundEvent.kind === 0) {
        try {
          currentNprofile = nprofileEncode(foundEvent.pubkey, standardRelays);
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
      handleSearchEvent(false, searchValue);
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
    if (dTagValue && !searching && !isResetting && dTagValue !== lastProcessedDTagValue) {
      console.log("EventSearch: Processing dTagValue:", dTagValue);
      lastProcessedDTagValue = dTagValue;
      handleSearchBySubscription('d', dTagValue);
    }
  });

  // Simple effect to handle event prop changes
  $effect(() => {
    if (event && !searching && !isResetting) {
      foundEvent = event;
    }
  });

  // Search utility functions
  function updateSearchState(isSearching: boolean, completed: boolean = false, count: number | null = null, type: string | null = null) {
    searching = isSearching;
    searchCompleted = completed;
    searchResultCount = count;
    searchResultType = type;
    if (onLoadingChange) {
      onLoadingChange(isSearching);
    }
  }

  function resetSearchState() {
    isResetting = true;
    foundEvent = null;
    relayStatuses = {};
    localError = null;
    lastProcessedSearchValue = null;
    lastProcessedDTagValue = null;
    isProcessingSearch = false;
    currentProcessingSearchValue = null;
    lastSearchValue = null;
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
        console.warn('Error stopping subscription:', e);
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
    relayStatuses = {}; // Clear relay statuses when event is found
    
    // Stop any ongoing subscription
    if (activeSub) {
      try {
        activeSub.stop();
      } catch (e) {
        console.warn('Error stopping subscription:', e);
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
    searchResultType = 'event';
    
    // Update last processed search value to prevent re-processing
    if (searchValue) {
      lastProcessedSearchValue = searchValue;
      lastSearchValue = searchValue;
    }
    
    // Reset processing flag
    isProcessingSearch = false;
    currentProcessingSearchValue = null;
    isWaitingForSearchResult = false;
    
    onEventFound(event);
  }

  function navigateToSearch(query: string, paramName: string) {
    const encoded = encodeURIComponent(query);
    goto(`?${paramName}=${encoded}`, {
      replaceState: false,
      keepFocus: true,
      noScroll: true,
    });
  }

  // Search handlers
  async function handleSearchBySubscription(searchType: 'd' | 't' | 'n', searchTerm: string) {
    console.log("EventSearch: Starting subscription search:", { searchType, searchTerm });
    isResetting = false; // Allow effects to run for new searches
    localError = null;
    updateSearchState(true);
    try {
      // Cancel existing search
      if (currentAbortController) {
        currentAbortController.abort();
      }
      currentAbortController = new AbortController();
      const result = await searchBySubscription(
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
              updatedResult.searchTerm
            );
          },
          onSubscriptionCreated: (sub) => {
            console.log("EventSearch: Subscription created:", sub);
            if (activeSub) {
              activeSub.stop();
            }
            activeSub = sub;
          }
        },
        currentAbortController.signal
      );
      console.log("EventSearch: Search completed:", result);
      onSearchResults(
        result.events,
        result.secondOrder,
        result.tTagEvents,
        result.eventIds,
        result.addresses,
        result.searchType,
        result.searchTerm
      );
      const totalCount = result.events.length + result.secondOrder.length + result.tTagEvents.length;
      relayStatuses = {}; // Clear relay statuses when search completes
      // Stop any ongoing subscription
      if (activeSub) {
        try {
          activeSub.stop();
        } catch (e) {
          console.warn('Error stopping subscription:', e);
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
    } catch (error) {
      if (error instanceof Error && error.message === 'Search cancelled') {
        isProcessingSearch = false;
        currentProcessingSearchValue = null;
        isWaitingForSearchResult = false;
        return;
      }
      console.error("EventSearch: Search failed:", error);
      localError = error instanceof Error ? error.message : 'Search failed';
      // Provide more specific error messages for different failure types
      if (error instanceof Error) {
        if (error.message.includes('timeout') || error.message.includes('connection')) {
          localError = 'Search timed out. The relays may be temporarily unavailable. Please try again.';
        } else if (error.message.includes('NDK not initialized')) {
          localError = 'Nostr client not initialized. Please refresh the page and try again.';
        } else {
          localError = `Search failed: ${error.message}`;
        }
      }
      relayStatuses = {}; // Clear relay statuses when search fails
      // Stop any ongoing subscription
      if (activeSub) {
        try {
          activeSub.stop();
        } catch (e) {
          console.warn('Error stopping subscription:', e);
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
  }
  }

  function handleClear() {
    isResetting = true;
    searchQuery = '';
    isUserEditing = false; // Reset user editing flag
    resetSearchState();
    
    // Clear URL parameters to reset the page
    goto('', {
      replaceState: true,
      keepFocus: true,
      noScroll: true,
    });
    
    // Ensure all search state is cleared
    searching = false;
    searchCompleted = false;
    searchResultCount = null;
    searchResultType = null;
    foundEvent = null;
    relayStatuses = {};
    localError = null;
    isProcessingSearch = false;
    currentProcessingSearchValue = null;
    lastSearchValue = null;
    isWaitingForSearchResult = false;
    
    // Clear any pending timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout);
      searchTimeout = null;
    }
    
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
    
    const typeLabel = searchResultType === 'n' ? 'profile' : 
                     searchResultType === 'nip05' ? 'NIP-05 address' : 'event';
    const countLabel = searchResultType === 'n' ? 'profiles' : 'events';
    
    return searchResultCount === 1 
      ? `Search completed. Found 1 ${typeLabel}.`
      : `Search completed. Found ${searchResultCount} ${countLabel}.`;
  }
</script>

<div class="flex flex-col space-y-6">
  <!-- Search Input Section -->
  <div class="flex gap-2 items-center">
    <Input
      bind:value={searchQuery}
      placeholder="Enter event ID, nevent, naddr, d:tag-name, t:topic, or n:username..."
      class="flex-grow"
      onkeydown={(e: KeyboardEvent) => e.key === "Enter" && handleSearchEvent(true)}
      oninput={() => isUserEditing = true}
      onblur={() => isUserEditing = false}
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
    <div class="p-4 mb-4 text-sm text-red-700 bg-red-100 rounded-lg" role="alert">
      {localError || error}
    </div>
  {/if}

  <!-- Success Display -->
  {#if showSuccess}
    <div class="p-4 mb-4 text-sm text-green-700 bg-green-100 rounded-lg" role="alert">
      {getResultMessage()}
    </div>
  {/if}

  <!-- Relay Status Display -->
  <div class="mt-4">
    <div class="flex flex-wrap gap-2">
      {#each Object.entries(relayStatuses) as [relay, status]}
        <RelayDisplay {relay} showStatus={true} {status} />
      {/each}
    </div>
    {#if !foundEvent && hasActiveSearch}
      <div class="text-gray-700 dark:text-gray-300 mt-2">
        Searching relays...
      </div>
    {/if}
  </div>
</div>
