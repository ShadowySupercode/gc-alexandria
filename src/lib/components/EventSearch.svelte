<script lang="ts">
  import { Input, Button } from "flowbite-svelte";
  import { Spinner } from "flowbite-svelte";
  import { goto } from "$app/navigation";
  import type { NDKEvent } from "$lib/utils/nostrUtils";
  import RelayDisplay from "./RelayDisplay.svelte";
  import { searchEvent, searchBySubscription, searchNip05 } from "$lib/utils/search_utility";
  import { neventEncode, naddrEncode } from "$lib/utils";
  import { standardRelays } from "$lib/consts";

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

  // Simple effect to handle searchValue changes
  $effect(() => {
    if (searchValue && !searching && !isResetting && searchValue !== lastProcessedSearchValue) {
      console.log("EventSearch: Processing searchValue:", searchValue);
      
        // Check if we already have this event displayed
  if (foundEvent) {
    const currentEventId = foundEvent.id;
    let currentNaddr = null;
    let currentNevent = null;
    
    try {
      currentNevent = neventEncode(foundEvent, standardRelays);
    } catch (e) {
      console.warn("Could not encode nevent for current event:", e);
    }
    
    try {
      currentNaddr = naddrEncode(foundEvent, standardRelays);
    } catch (e) {
      console.warn("Could not encode naddr for current event:", e);
    }
    
    // If the search value matches any of our current event identifiers, skip the search
    if (searchValue === currentEventId || searchValue === currentNaddr || searchValue === currentNevent) {
      console.log("EventSearch: Search value matches current event, skipping search");
      lastProcessedSearchValue = searchValue;
      return;
    }
  }
      
      lastProcessedSearchValue = searchValue;
      // Always search when searchValue changes, regardless of foundEvent
      handleSearchEvent(false, searchValue);
    }
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

    // Cancel existing search
    if (currentAbortController) {
      currentAbortController.abort();
    }
    
    currentAbortController = new AbortController();

    try {
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
    } catch (error) {
      if (error instanceof Error && error.message === 'Search cancelled') {
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
    }
  }

  async function handleNip05Search(query: string) {
    try {
      const foundEvent = await searchNip05(query);
      if (foundEvent) {
        handleFoundEvent(foundEvent);
        updateSearchState(false, true, 1, 'nip05');
      } else {
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
        
        updateSearchState(false, true, 0, 'nip05');
      }
    } catch (error) {
      localError = error instanceof Error ? error.message : 'NIP-05 lookup failed';
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
    }
  }

  async function handleEventSearch(query: string) {
    try {
      const foundEvent = await searchEvent(query);
      if (!foundEvent) {
        console.warn("[Events] Event not found for query:", query);
        localError = "Event not found";
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
        
        updateSearchState(false, false, null, null);
      } else {
        console.log("[Events] Event found:", foundEvent);
        handleFoundEvent(foundEvent);
        updateSearchState(false, true, 1, 'event');
      }
    } catch (err) {
      console.error("[Events] Error fetching event:", err, "Query:", query);
      localError = "Error fetching event. Please check the ID and try again.";
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
    }
  }

  async function handleSearchEvent(clearInput: boolean = true, queryOverride?: string) {
    // Prevent multiple simultaneous searches
    if (searching) {
      console.log("EventSearch: Already searching, skipping");
      return;
    }
    
    resetSearchState();
    localError = null;
    updateSearchState(true);
    isResetting = false; // Allow effects to run for new searches

    const query = (queryOverride !== undefined ? queryOverride : searchQuery).trim();
    if (!query) {
      updateSearchState(false, false, null, null);
      return;
    }

    // Handle different search types
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

    // Handle regular event search
    if (clearInput) {
      navigateToSearch(query, 'id');
      searchQuery = "";
    }

    await handleEventSearch(query);
  }

  function handleClear() {
    isResetting = true;
    searchQuery = '';
    resetSearchState();
    
    // Ensure all search state is cleared
    searching = false;
    searchCompleted = false;
    searchResultCount = null;
    searchResultType = null;
    foundEvent = null;
    relayStatuses = {};
    localError = null;
    
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
      {#if searchQuery.trim()}
        <div class="mt-2">
          You can also try viewing this event on
          <a
            class="underline text-primary-700"
            href={"https://njump.me/" + encodeURIComponent(searchQuery.trim())}
            target="_blank"
            rel="noopener"
          >
            Njump
          </a>.
        </div>
      {/if}
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
