<script lang="ts">
  import { Button, Input } from "flowbite-svelte";
  import { relayGroup, useFallbackRelays } from "$lib/stores/relayGroup";
  import { selectRelayGroup } from "$lib/utils";
  import { fallbackRelays } from "$lib/consts";
  import { onDestroy, onMount } from "svelte";
  import type { NostrEvent } from '$lib/types/nostr';

  // Constants
  const SEARCH_TIMEOUT = 10000; // 10 seconds timeout for overall search operation
  const RELAY_TIMEOUT = 2500; // 2.5 seconds timeout for individual relay fetches

  // Props
  const {
    placeholder = "Search...",
    initialValue = "",
    searchDisabled = false,
    clearDisabled = false,
    isSearching = false,
    onDispatchSearch = (query: string, relays: string[], signal: AbortSignal, options: { relayTimeout?: number } = {}) => {},
    onDispatchCancel = () => {},
    onDispatchClear = () => {},
    onSearchResults = (events: NostrEvent[]) => {},
    onSearchError = (error: { message: string; code: string } | null) => {},
    onSearchProgress = (progress: { processed: number; total: number; percentage: number } | null) => {},
  } = $props<{
    placeholder?: string;
    initialValue?: string;
    showFallbackToggle?: boolean;
    searchDisabled?: boolean;
    clearDisabled?: boolean;
    isSearching?: boolean;
    onDispatchSearch?: (query: string, relays: string[], signal: AbortSignal, options?: { relayTimeout?: number }) => void;
    onDispatchCancel?: () => void;
    onDispatchClear?: () => void;
    onSearchResults?: (events: NostrEvent[]) => void;
    onSearchError?: (error: { message: string; code: string } | null) => void;
    onSearchProgress?: (progress: { processed: number; total: number; percentage: number } | null) => void;
  }>();

  // State
  let searchValue = $state(initialValue);
  let searchTimeout: number | null = $state(null);
  let searchAbortController: AbortController | null = $state(null);

  // Derived values
  let activeRelays = $derived.by(() => {
    const primaryRelays = selectRelayGroup('inbox');
    const fallback = $useFallbackRelays
      ? fallbackRelays.filter((r) => !primaryRelays.includes(r))
      : [];
    return [...primaryRelays, ...fallback];
  });

  // Functions
  function handleSearch() {
    if (searchValue.trim()) {
      const query = searchValue.trim();
      console.log(`[Search] Starting search for "${query}"`);
      console.log(`[Search] Using relays:`, activeRelays);

      // Cancel any ongoing search
      if (searchAbortController) {
        searchAbortController.abort();
      }
      searchAbortController = new AbortController();

      // Set search timeout
      if (searchTimeout) {
        window.clearTimeout(searchTimeout);
      }
      searchTimeout = window.setTimeout(() => {
        if (searchAbortController) {
          const error = {
            message: "Search operation timed out",
            code: "TIMEOUT",
          };
          onSearchError(error);
          searchAbortController.abort();
          searchAbortController = null;
        }
      }, SEARCH_TIMEOUT);

      // Start search with relay timeout option
      onDispatchSearch(query, activeRelays, searchAbortController.signal, { relayTimeout: RELAY_TIMEOUT });
    }
  }

  function handleClear() {
    console.log('[Search] Clearing search');
    if (searchTimeout) {
      window.clearTimeout(searchTimeout);
      searchTimeout = null;
    }
    if (searchAbortController) {
      searchAbortController.abort();
      searchAbortController = null;
    }
    searchValue = "";
    onDispatchClear();
  }

  function handleCancel() {
    console.log('[Search] Cancelling search');
    if (searchTimeout) {
      window.clearTimeout(searchTimeout);
      searchTimeout = null;
    }
    if (searchAbortController) {
      searchAbortController.abort();
      searchAbortController = null;
    }
    onDispatchCancel();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      handleSearch();
    } else if (event.key === "Escape") {
      handleCancel();
    }
  }

  // Effects
  $effect(() => {
    console.log('[Search] Relay configuration updated:', {
      relayGroup: $relayGroup,
      useFallbackRelays: $useFallbackRelays,
      activeRelays
    });
  });

  // Lifecycle
  onMount(() => {
    if (initialValue) {
      handleSearch();
    }
  });

  onDestroy(() => {
    if (searchTimeout) {
      window.clearTimeout(searchTimeout);
    }
    if (searchAbortController) {
      searchAbortController.abort();
    }
  });
</script>

<div class="flex flex-col gap-2">
  <div class="flex gap-2">
    <div class="relative flex-grow">
      <Input
        type="text"
        {placeholder}
        bind:value={searchValue}
        onkeydown={handleKeydown}
        disabled={searchDisabled}
        class="w-full"
      />
      {#if searchValue}
        <button
          class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          onclick={handleClear}
          disabled={clearDisabled}
          aria-label="Clear search"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      {/if}
    </div>
    <Button
      onclick={handleSearch}
      disabled={searchDisabled || !searchValue.trim()}
      class="flex items-center"
    >
      {#if isSearching}
        <svg
          class="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            class="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-width="4"
          ></circle>
          <path
            class="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
        Searching...
      {:else}
        <svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="8" stroke-linecap="round" stroke-linejoin="round" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        Search
      {/if}
    </Button>
  </div>
</div>
