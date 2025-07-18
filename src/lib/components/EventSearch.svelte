<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { Input, Button } from "flowbite-svelte";
  import { Spinner } from "flowbite-svelte";
  import type { NDKEvent } from "$lib/utils/nostrUtils";
  import {
    searchEvent,
    searchBySubscription,
    searchNip05,
  } from "$lib/utils/search_utility";
  import { neventEncode, naddrEncode, nprofileEncode } from "$lib/utils";
  import { activeInboxRelays, activeOutboxRelays } from "$lib/ndk";
  import { getMatchingTags, toNpub } from "$lib/utils/nostrUtils";
  import type { SearchResult } from '$lib/utils/search_types';
  import { userStore } from "$lib/stores/userStore";
  import { get } from "svelte/store";

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
      searchTerm?: string,
    ) => void;
    event: NDKEvent | null;
    onClear?: () => void;
    onLoadingChange?: (loading: boolean) => void;
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
    resetSearchState();
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
      const searchTerm = query.slice(2).trim();
      if (searchTerm) {
        await handleSearchBySubscription("t", searchTerm);
        return;
      }
    }
    if (query.toLowerCase().startsWith("n:")) {
      const searchTerm = query.slice(2).trim();
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
      navigateToSearch(query, "id");
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
    if (
      !searchValue ||
      searching ||
      isResetting ||
      isProcessingSearch ||
      isWaitingForSearchResult
    ) {
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
  async function handleSearchBySubscription(
    searchType: "d" | "t" | "n",
    searchTerm: string,
  ) {
    console.log("EventSearch: Starting subscription search:", {
      searchType,
      searchTerm,
    });
    isResetting = false; // Allow effects to run for new searches
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
      console.debug(`EventSearch: User is logged in (${currentUser.pubkey}), waiting for user-specific relays...`);
      retryCount = 0;
      while ($activeOutboxRelays.length <= 9 && retryCount < maxRetries) {
        // If we still have the default relay count (9), wait for user-specific relays
        console.debug(`EventSearch: Waiting for user-specific relays... (attempt ${retryCount + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 500));
        retryCount++;
      }
    }
    
    // Check if we have any relays available
    if ($activeInboxRelays.length === 0 && $activeOutboxRelays.length === 0) {
      console.warn("EventSearch: No relays available after waiting, failing search");
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
      // Add a timeout to prevent hanging searches
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
      
      // Add a 30-second timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error("Search timeout: No results received within 30 seconds"));
        }, 30000);
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
      
      // Update last processed search value to prevent re-processing
      if (searchValue) {
        lastProcessedSearchValue = searchValue;
      }
    } catch (error) {
      if (error instanceof Error && error.message === "Search cancelled") {
        isProcessingSearch = false;
        currentProcessingSearchValue = null;
        isWaitingForSearchResult = false;
        return;
      }
      console.error("EventSearch: Search failed:", error);
      localError = error instanceof Error ? error.message : "Search failed";
      // Provide more specific error messages for different failure types
      if (error instanceof Error) {
        if (
          error.message.includes("timeout") ||
          error.message.includes("connection")
        ) {
          localError =
            "Search timed out. The relays may be temporarily unavailable. Please try again.";
        } else if (error.message.includes("NDK not initialized")) {
          localError =
            "Nostr client not initialized. Please refresh the page and try again.";
        } else {
          localError = `Search failed: ${error.message}`;
        }
      }
      localError = null; // Clear local error when search fails
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
      
      // Update last processed search value to prevent re-processing even on error
      if (searchValue) {
        lastProcessedSearchValue = searchValue;
      }
    }
  }

  function handleClear() {
    isResetting = true;
    searchQuery = "";
    isUserEditing = false; // Reset user editing flag
    resetSearchState();

    // Clear URL parameters to reset the page
    goto("", {
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

  function getNeventUrl(event: NDKEvent): string {
    return neventEncode(event, $activeInboxRelays);
  }

  function getNaddrUrl(event: NDKEvent): string {
    return naddrEncode(event, $activeInboxRelays);
  }

  function getNprofileUrl(pubkey: string): string {
    return nprofileEncode(pubkey, $activeInboxRelays);
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
    <div
      class="p-4 mb-4 text-sm text-red-700 bg-red-100 rounded-lg"
      role="alert"
    >
      {localError || error}
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
