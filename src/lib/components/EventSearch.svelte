<script lang="ts">
  import { goto } from "$app/navigation";
  import { Input, Button } from "flowbite-svelte";
  import { Spinner } from "flowbite-svelte";
  import { NDKEvent } from "@nostr-dev-kit/ndk";
  import {
    searchEvent,
    searchBySubscription,
    searchNip05,
  } from "$lib/utils/search_utility";
  import { neventEncode, naddrEncode, nprofileEncode } from "$lib/utils";
  import {
    activeInboxRelays,
    activeOutboxRelays,
    getNdkContext,
  } from "$lib/ndk";
  import { getMatchingTags, toNpub } from "$lib/utils/nostrUtils";
  import { isEventId } from "$lib/utils/nostr_identifiers";
  import type { SearchType } from "$lib/models/search_type";

  // Props definition
  let {
    loading,
    error,
    searchValue,
    searchType,
    onEventFound,
    onSearchResults,
    event,
    onClear,
    onLoadingChange,
  }: {
    loading: boolean;
    error: string | null;
    searchValue: string | null;
    searchType: SearchType | null;
    onEventFound: (event: NDKEvent) => void;
    onSearchResults: (
      firstOrder: NDKEvent[],
      secondOrder: NDKEvent[],
      tTagEvents: NDKEvent[],
      eventIds: Set<string>,
      addresses: Set<string>,
      searchType?: string,
      searchTerm?: string,
      loading?: boolean, // AI-NOTE: 2025-01-24 - Add loading parameter for second-order search message logic
    ) => void;
    event: NDKEvent | null;
    onClear?: () => void;
    onLoadingChange?: (loading: boolean) => void;
  } = $props();

  const ndk = getNdkContext();

  // Component state
  let searchQuery = $state("");
  let localError = $state<string | null>(null);
  let foundEvent = $state<NDKEvent | null>(null);
  let searching = $state(false);
  let searchCompleted = $state<boolean>(false);
  let searchResultCount = $state<number | null>(null);
  let searchResultType = $state<string | null>(null);
  let isResetting = $state(false);

  // Track current search type for internal logic
  let currentSearchType = $state<SearchType | null>(searchType);
  let currentSearchValue = $state<string | null>(searchValue);

  // Sync internal state with props when they change externally
  $effect(() => {
    if (searchType !== undefined) {
      currentSearchType = searchType;
    }
    if (searchValue !== undefined) {
      currentSearchValue = searchValue;
    }
  });

  // Internal state for cleanup
  let activeSub: any = null;
  let currentAbortController: AbortController | null = null;

  // Derived values
  let hasActiveSearch = $derived(searching && !foundEvent);
  let showError = $derived(localError || error);
  let showSuccess = $derived(searchCompleted && searchResultCount !== null);

  // Track last processed values to prevent loops
  let lastProcessedSearchValue = $state<string | null>(null);
  let lastProcessedSearchType = $state<SearchType | null>(null);
  let isProcessingSearch = $state(false);
  let currentProcessingSearchValue = $state<string | null>(null);
  let lastSearchValue = $state<string | null>(null);
  let isWaitingForSearchResult = $state(false);
  let isUserEditing = $state(false);

  // Debounced search timeout
  let searchTimeout: ReturnType<typeof setTimeout> | null = null;

  // AI-NOTE: Core search handlers extracted for better organization
  async function handleNip05Search(query: string) {
    try {
      const foundEvent = await searchNip05(query, ndk);
      if (foundEvent) {
        handleFoundEvent(foundEvent);
        updateSearchState(false, true, 1, "nip05");
      } else {
        cleanupSearch();
        updateSearchState(false, true, 0, "nip05");
      }
    } catch (error) {
      handleSearchError(error, "NIP-05 lookup failed");
    }
  }

  async function handleProfileSearch(query: string) {
    try {
      console.log("EventSearch: Starting profile search for:", query);
      
      // Use the profile search service to find the profile
      const { searchProfiles } = await import("$lib/utils/profile_search");
      const result = await searchProfiles(query, ndk);
      
      if (result.profiles && result.profiles.length > 0) {
        console.log("EventSearch: Profile found:", result.profiles[0]);
        
        // Create an NDKEvent from the profile data
        const profileEvent = new NDKEvent(ndk);
        profileEvent.kind = 0; // Profile event kind
        profileEvent.content = JSON.stringify(result.profiles[0]);
        profileEvent.pubkey = result.profiles[0].pubkey || "";
        
        handleFoundEvent(profileEvent);
        updateSearchState(false, true, 1, "profile");
      } else {
        console.log("EventSearch: No profile found for:", query);
        cleanupSearch();
        updateSearchState(false, true, 0, "profile");
      }
    } catch (error) {
      handleSearchError(error, "Profile lookup failed");
    }
  }

  async function handleEventSearch(query: string) {
    try {
      const foundEvent = await searchEvent(query, ndk);
      if (!foundEvent) {
        console.warn("[Events] Event not found for query:", query);
        localError = "Event not found";
        cleanupSearch();
        updateSearchState(false, false, null, null);
      } else {
        console.log("[Events] Event found:", foundEvent);
        handleFoundEvent(foundEvent);
        updateSearchState(false, true, 1, "event");
      }
    } catch (err) {
      handleSearchError(
        err,
        "Error fetching event. Please check the ID and try again.",
      );
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
    updateSearchState(true, false);
    isResetting = false;
    isUserEditing = false;

    const query = (
      queryOverride !== undefined ? queryOverride || "" : searchQuery || ""
    ).trim();
    if (!query) {
      updateSearchState(false, false, null, null);
      return;
    }

    // Update URL with search query for all search types
    if (clearInput) {
      const detectedSearchType = getSearchType(query);
      if (detectedSearchType) {
        const { type, term } = detectedSearchType;
        const encoded = encodeURIComponent(term);
        let newUrl = "";

        if (type === "d") {
          newUrl = `?d=${encoded}`;
          currentSearchType = "d";
          currentSearchValue = term;
        } else if (type === "t") {
          newUrl = `?t=${encoded}`;
          currentSearchType = "t";
          currentSearchValue = term;
        } else if (type === "n") {
          newUrl = `?n=${encoded}`;
          currentSearchType = "n";
          currentSearchValue = term;
        } else if (type === "nip05") {
          newUrl = `?q=${encodeURIComponent(query)}`;
          currentSearchType = "q";
          currentSearchValue = query;
        } else if (type === "event") {
          newUrl = `?id=${encoded}`;
          currentSearchType = "id";
          currentSearchValue = term;
        }

        goto(newUrl, {
          replaceState: false,
          keepFocus: true,
          noScroll: true,
        });
      } else {
        // No specific search type detected, treat as general search
        const encoded = encodeURIComponent(query);
        const newUrl = `?q=${encoded}`;
        currentSearchType = "q";
        currentSearchValue = query;
        goto(newUrl, {
          replaceState: false,
          keepFocus: true,
          noScroll: true,
        });
      }
    }

    // Handle different search types
    const searchType = getSearchType(query);
    if (searchType) {
      await handleSearchByType(searchType, query, clearInput);
      return;
    }

    // AI-NOTE: If no specific search type is detected, check if it could be an event ID
    const trimmedQuery = query.trim();
    if (trimmedQuery && isEventId(trimmedQuery)) {
      // Looks like an event ID, treat as event search
      await handleEventSearch(query);
    } else {
      // AI-NOTE: Doesn't look like an event ID, treat as generic search
      // The URL update logic above should have set currentSearchType = "q"
      // For generic "q" searches, we don't perform actual searches since they're
      // unstructured queries. We just update the URL for shareability and show completion

      // TODO: Handle generic "q" searches with a semantic search capability (when available).
      updateSearchState(false, true, 0, "q");
    }
  }

  // AI-NOTE: Helper functions for better code organization
  function getSearchType(query: string): { type: string; term: string } | null {
    const lowerQuery = query.toLowerCase();

    if (lowerQuery.startsWith("d:")) {
      const dTag = query.slice(2).trim().toLowerCase();
      return dTag ? { type: "d", term: dTag } : null;
    }

    if (lowerQuery.startsWith("t:")) {
      const searchTerm = query.slice(2).trim();
      return searchTerm ? { type: "t", term: searchTerm } : null;
    }

    if (lowerQuery.startsWith("n:")) {
      const searchTerm = query.slice(2).trim();
      return searchTerm ? { type: "n", term: searchTerm } : null;
    }

    if (query.includes("@")) {
      return { type: "nip05", term: query };
    }

    // AI-NOTE: Detect Nostr identifiers (npub, nevent, naddr, nprofile)
    const trimmedQuery = query.trim();
    if (trimmedQuery.startsWith("npub") || trimmedQuery.startsWith("nprofile")) {
      return { type: "profile", term: trimmedQuery };
    }

    if (trimmedQuery.startsWith("nevent") || trimmedQuery.startsWith("note")) {
      return { type: "event", term: trimmedQuery };
    }

    if (trimmedQuery.startsWith("naddr")) {
      return { type: "event", term: trimmedQuery };
    }

    // AI-NOTE: Detect hex IDs (64-character hex strings with no spaces)
    // These are likely event IDs and should be searched as events
    if (trimmedQuery && isEventId(trimmedQuery)) {
      return { type: "event", term: trimmedQuery };
    }

    // AI-NOTE: Treat plain text searches as generic searches by default
    // This allows for flexible searching without assuming it's always a profile search
    // Users can still use n: prefix for explicit name/profile searches
    if (trimmedQuery) {
      return null; // Let handleSearchEvent treat this as a generic search
    }

    return null;
  }

  async function handleSearchByType(
    searchType: { type: string; term: string },
    query: string,
    clearInput: boolean,
  ) {
    const { type, term } = searchType;

    if (type === "d") {
      console.log("EventSearch: Processing d-tag search:", term);
      // URL navigation is now handled in handleSearchEvent
      updateSearchState(false, false, null, null);
      return;
    }

    if (type === "nip05") {
      await handleNip05Search(term);
      return;
    }

    if (type === "profile") {
      console.log("EventSearch: Processing profile search:", term);
      await handleProfileSearch(term);
      return;
    }

    if (type === "event") {
      console.log("EventSearch: Processing event ID search:", term);
      // URL navigation is now handled in handleSearchEvent
      await handleEventSearch(term);
      return;
    }

    if (type === "t" || type === "n") {
      await handleSearchBySubscription(type as "t" | "n", term);
      return;
    }
  }

  function handleSearchError(error: unknown, defaultMessage: string) {
    localError = error instanceof Error ? error.message : defaultMessage;
    cleanupSearch();
    updateSearchState(false, false, null, null);
    isProcessingSearch = false;
    currentProcessingSearchValue = null;
    lastSearchValue = null;
  }

  function cleanupSearch() {
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
  }

  // AI-NOTE: 2025-01-24 - Effects organized for better readability
  $effect(() => {
    if (searching || isResetting || isUserEditing) {
      return;
    }

    // Use internal state if set (from user actions), otherwise use props
    const activeSearchType = currentSearchType ?? searchType;
    const activeSearchValue = currentSearchValue ?? searchValue;

    if (activeSearchValue && activeSearchType) {
      if (activeSearchType === "d") {
        searchQuery = `d:${activeSearchValue}`;
      } else if (activeSearchType === "t") {
        searchQuery = `t:${activeSearchValue}`;
      } else if (activeSearchType === "n") {
        searchQuery = `n:${activeSearchValue}`;
      } else {
        searchQuery = activeSearchValue;
      }
    } else if (!searchQuery) {
      searchQuery = "";
    }
  });

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

    if (searchValue === lastProcessedSearchValue) {
      return;
    }

    if (foundEvent && isCurrentEventMatch(searchValue, foundEvent)) {
      lastProcessedSearchValue = searchValue;
      return;
    }

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

  $effect(() => {
    return () => {
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
    };
  });

  $effect(() => {
    // Use internal state if set (from user actions), otherwise use props
    const activeSearchType = currentSearchType ?? searchType;
    const activeSearchValue = currentSearchValue ?? searchValue;

    if (
      activeSearchValue &&
      activeSearchType &&
      !searching &&
      !isResetting &&
      (activeSearchType !== lastProcessedSearchType ||
        activeSearchValue !== lastProcessedSearchValue)
    ) {

      lastProcessedSearchType = activeSearchType;
      lastProcessedSearchValue = activeSearchValue;

      setTimeout(() => {
        if (!searching && !isResetting) {
          if (activeSearchType === "d") {
            handleSearchBySubscription("d", activeSearchValue);
          } else if (activeSearchType === "t") {
            handleSearchBySubscription("t", activeSearchValue);
          } else if (activeSearchType === "n") {
            handleSearchBySubscription("n", activeSearchValue);
          }
          // Note: "q" (generic) searches are not processed here since they're
          // unstructured queries that don't require actual search execution
        }
      }, 100);
    }
  });

  $effect(() => {
    if (event && !searching && !isResetting) {
      foundEvent = event;
    }
  });

  // AI-NOTE: 2025-01-24 - Utility functions for event matching and state management
  function isCurrentEventMatch(searchValue: string, event: NDKEvent): boolean {
    const currentEventId = event.id;
    let currentNaddr: string | null = null;
    let currentNevent: string | null = null;
    let currentNpub: string | null = null;
    let currentNprofile: string | null = null;

    try {
      currentNevent = neventEncode(event, $activeInboxRelays);
    } catch {}

    try {
      currentNaddr = getMatchingTags(event, "d")[0]?.[1]
        ? naddrEncode(event, $activeInboxRelays)
        : null;
    } catch {}

    try {
      currentNpub = event.kind === 0 ? toNpub(event.pubkey) : null;
    } catch {}

    if (
      searchValue &&
      searchValue.startsWith("nprofile1") &&
      event.kind === 0
    ) {
      try {
        currentNprofile = nprofileEncode(event.pubkey, $activeInboxRelays);
      } catch {}
    }

    return !!(
      searchValue === currentEventId ||
      (currentNaddr && searchValue === currentNaddr) ||
      (currentNevent && searchValue === currentNevent) ||
      (currentNpub && searchValue === currentNpub) ||
      (currentNprofile && searchValue === currentNprofile)
    );
  }

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
    lastProcessedSearchType = null;
    isProcessingSearch = false;
    currentProcessingSearchValue = null;
    lastSearchValue = null;
    // Reset internal search state
    currentSearchType = null;
    currentSearchValue = null;
    updateSearchState(false, false, null, null);

    cleanupSearch();
    onSearchResults([], [], [], new Set(), new Set());

    if (searchTimeout) {
      clearTimeout(searchTimeout);
      searchTimeout = null;
    }

    setTimeout(() => {
      isResetting = false;
    }, 100);
  }

  function handleFoundEvent(event: NDKEvent) {
    foundEvent = event;
    localError = null;

    cleanupSearch();

    searching = false;
    searchCompleted = true;
    searchResultCount = 1;
    searchResultType = "event";

    if (searchValue) {
      lastProcessedSearchValue = searchValue;
      lastSearchValue = searchValue;
    }

    if (searchType) {
      lastProcessedSearchType = searchType;
    }

    isProcessingSearch = false;
    currentProcessingSearchValue = null;
    isWaitingForSearchResult = false;

    onEventFound(event);
  }

  // AI-NOTE: Main subscription search handler with improved error handling
  async function handleSearchBySubscription(
    searchType: "d" | "t" | "n",
    searchTerm: string,
  ) {
    console.log("EventSearch: Starting subscription search:", {
      searchType,
      searchTerm,
    });

    // AI-NOTE: Profile search caching is now handled by centralized searchProfiles function
    // No need for separate caching logic here as it's handled in profile_search.ts

    isResetting = false;
    localError = null;
    updateSearchState(true, false);

    await waitForRelays();

    try {
      await performSubscriptionSearch(searchType, searchTerm);
    } catch (error) {
      handleSubscriptionSearchError(error);
    }
  }

  // AI-NOTE: Profile search is now handled by centralized searchProfiles function
  // These functions are no longer needed as profile searches go through subscription_search.ts
  // which delegates to the centralized profile_search.ts

  async function waitForRelays(): Promise<void> {
    let retryCount = 0;
    const maxRetries = 10; // Reduced retry count since we'll use all available relays

    // AI-NOTE: Wait for any relays to be available, not just specific types
    // This ensures searches can proceed even if some relay types are not available
    while (retryCount < maxRetries) {
      // Check if we have any relays in the NDK pool
      if (ndk && ndk.pool && ndk.pool.relays && ndk.pool.relays.size > 0) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
      retryCount++;
    }

    // AI-NOTE: Don't fail if no relays are available, let the search functions handle fallbacks
    // The search functions will use all available relays including fallback relays
    const poolRelayCount = ndk?.pool?.relays?.size || 0;

    console.log("EventSearch: Relay status for search:", {
      poolRelayCount,
      inboxCount: $activeInboxRelays.length,
      outboxCount: $activeOutboxRelays.length,
      willUseAllRelays:
        poolRelayCount > 0 ||
        $activeInboxRelays.length > 0 ||
        $activeOutboxRelays.length > 0,
    });

    // If we have any relays available, proceed with search
    if (
      poolRelayCount > 0 ||
      $activeInboxRelays.length > 0 ||
      $activeOutboxRelays.length > 0
    ) {
      console.log("EventSearch: Relays available, proceeding with search");
    } else {
      console.warn(
        "EventSearch: No relays detected, but proceeding with search - fallback relays will be used",
      );
    }
  }

  async function performSubscriptionSearch(
    searchType: "d" | "t" | "n",
    searchTerm: string,
  ): Promise<void> {
    if (currentAbortController) {
      currentAbortController.abort();
    }
    currentAbortController = new AbortController();

    const searchPromise = searchBySubscription(
      searchType,
      searchTerm,
      ndk,
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
            searchValue || updatedResult.searchTerm, // AI-NOTE: Use original search value for display
            false, // AI-NOTE: Second-order update means search is complete
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

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(
          new Error("Search timeout: No results received within 30 seconds"),
        );
      }, 30000);
    });

    const result = (await Promise.race([searchPromise, timeoutPromise])) as any;
    console.log("EventSearch: Search completed:", result);

    onSearchResults(
      result.events,
      result.secondOrder,
      result.tTagEvents,
      result.eventIds,
      result.addresses,
      result.searchType,
      searchValue || result.searchTerm, // AI-NOTE: Use original search value for display
      false, // AI-NOTE: Search is complete
    );

    const totalCount =
      result.events.length +
      result.secondOrder.length +
      result.tTagEvents.length;
    localError = null;

    cleanupSearch();
    updateSearchState(false, true, totalCount, searchType);
    isProcessingSearch = false;
    currentProcessingSearchValue = null;
    isWaitingForSearchResult = false;

    if (searchValue) {
      lastProcessedSearchValue = searchValue;
    }
  }

  function handleSubscriptionSearchError(error: unknown): void {
    if (error instanceof Error && error.message === "Search cancelled") {
      isProcessingSearch = false;
      currentProcessingSearchValue = null;
      isWaitingForSearchResult = false;
      return;
    }

    console.error("EventSearch: Search failed:", error);

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
    } else {
      localError = "Search failed";
    }

    cleanupSearch();
    updateSearchState(false, false, null, null);
    isProcessingSearch = false;
    currentProcessingSearchValue = null;
    isWaitingForSearchResult = false;

    if (searchValue) {
      lastProcessedSearchValue = searchValue;
    }

    if (searchType) {
      lastProcessedSearchType = searchType;
    }
  }

  // AI-NOTE: 2025-01-24 - Background profile search is now handled by centralized searchProfiles function
  // This function is no longer needed as profile searches go through subscription_search.ts
  // which delegates to the centralized profile_search.ts

  function handleClear() {
    isResetting = true;
    searchQuery = "";
    isUserEditing = false;
    resetSearchState();

    goto("", {
      replaceState: true,
      keepFocus: true,
      noScroll: true,
    });

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
    // Reset internal search state
    currentSearchType = null;
    currentSearchValue = null;

    if (searchTimeout) {
      clearTimeout(searchTimeout);
      searchTimeout = null;
    }

    if (onClear) {
      onClear();
    }

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
