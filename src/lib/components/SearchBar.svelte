<script lang="ts">
  import { Input, Button, Checkbox, Search, Tooltip } from "flowbite-svelte";
  import { onMount, onDestroy } from "svelte";
  import { searchStore } from "$lib/stores/searchStore";
  import type { NDKEvent } from "$lib/utils/nostrUtils";

  let {
    placeholder = "Search...",
    initialValue = "",
    showFallbackToggle = false,
    initialFallbackValue = true,
    disabled = false,
    useFallbackRelays = $bindable(initialFallbackValue),
    onDispatchSearch,
    onDispatchCancel,
    onDispatchClear,
  } = $props<{
    placeholder?: string;
    initialValue?: string;
    showFallbackToggle?: boolean;
    initialFallbackValue?: boolean;
    disabled?: boolean;
    useFallbackRelays?: boolean;
    onDispatchSearch?: (query: string, useFallbackRelays: boolean) => void;
    onDispatchCancel?: () => void;
    onDispatchClear?: () => void;
  }>();

  // State from store
  let searchInput = $state(initialValue);
  let isSearching = $state(false);
  let suggestions = $state<
    Array<{ text: string; type: "title" | "author" | "tag"; score: number }>
  >([]);
  let searchError = $state<{ message: string; code: string } | null>(null);

  // Subscribe to store updates
  const unsubscribe = searchStore.subscribe((state) => {
    searchInput = state.query;
    isSearching = state.isSearching;
    suggestions = state.suggestions;
    searchError = state.error;
  });

  // Convert state variables to derived values
  let showSuggestions = $state(false);
  let selectedIndex = $state(-1); // Keep as state since it's modified by keyboard navigation
  let debounceTimer: number | null = $state(null);

  // Derived values for button
  type ButtonColor =
    | "red"
    | "primary"
    | "green"
    | "yellow"
    | "purple"
    | "blue"
    | "light"
    | "dark"
    | "none"
    | "alternative";

  // Convert more state variables to derived values
  let hasQuery = $derived.by(() => searchInput.trim().length > 0);

  let hasSuggestions = $derived.by(() => suggestions.length > 0);

  let showSuggestionsPanel = $derived.by(
    () => showSuggestions && hasSuggestions,
  );

  let searchButtonState = $derived.by(() => ({
    text: isSearching ? "Cancel" : "Search",
    color: isSearching ? "red" : ("primary" as ButtonColor),
    disabled: !hasQuery && !isSearching,
  }));

  let suggestionItems = $derived.by(() =>
    suggestions.map((suggestion) => ({
      ...suggestion,
      displayTitle: suggestion.text || "Untitled",
      displayAuthor:
        suggestion.type === "author" ? suggestion.text : "Unknown Author",
    })),
  );

  // Initialize worker on mount
  onMount(() => {
    searchStore.initializeWorker();
  });

  // Cleanup on destroy
  onDestroy(() => {
    searchStore.cleanupWorker();
    unsubscribe();
    if (debounceTimer) {
      window.clearTimeout(debounceTimer);
    }
  });

  // Function to perform search
  async function performSearch() {
    if (!searchInput.trim() || disabled) return;

    if (isSearching) {
      onDispatchCancel?.();
      return;
    }

    onDispatchSearch?.(searchInput.trim(), useFallbackRelays);
  }

  // Function to clear search
  function clearSearch() {
    if (isSearching) {
      onDispatchCancel?.();
    }
    searchStore.clearSearch();
    onDispatchClear?.();
  }

  function handlePaste(e: ClipboardEvent) {
    const pastedText = e.clipboardData?.getData("text");
    if (pastedText) {
      searchStore.update((state) => ({ ...state, query: pastedText }));
    }
  }

  // Function to handle input changes
  function handleInput() {
    if (debounceTimer) {
      window.clearTimeout(debounceTimer);
    }

    if (searchInput.length < 2) {
      return;
    }

    debounceTimer = window.setTimeout(async () => {
      await searchStore.getSuggestions(searchInput.trim());
    }, 150); // 150ms debounce
  }

  // Function to handle suggestion selection
  function selectSuggestion(suggestion: {
    text: string;
    type: "title" | "author" | "tag";
  }) {
    searchStore.update((state) => ({ ...state, query: suggestion.text }));
    performSearch();
  }

  // Function to handle keyboard navigation
  function handleKeydown(e: KeyboardEvent) {
    if (!showSuggestions) {
      if (e.key === "Enter") {
        performSearch();
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, suggestions.length - 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, -1);
        break;
      case "Enter":
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          selectSuggestion(suggestions[selectedIndex]);
        } else {
          performSearch();
        }
        break;
      case "Escape":
        e.preventDefault();
        selectedIndex = -1;
        break;
    }
  }

  // Expose method to update events for autocomplete
  export function updateEvents(events: NDKEvent[]) {
    searchStore.updateEvents(events);
  }

  // Allow parent to control isSearching state
  export function stopSearching() {
    searchStore.update((state) => ({ ...state, isSearching: false }));
  }
</script>

<div class="flex flex-col w-full gap-4 relative">
  <div class="flex items-center w-full gap-2">
    <Search
      bind:value={searchInput}
      type="text"
      {placeholder}
      oninput={handleInput}
      onkeydown={handleKeydown}
      onpaste={handlePaste}
      onfocus={() => (showSuggestions = true)}
      onblur={() => setTimeout(() => (showSuggestions = false), 200)}
      wrapperClass="relative flex-grow"
    ></Search>
    <Button onclick={performSearch} {disabled} class="me-1"
      >{searchButtonState.text}
    </Button>
    <Button onclick={clearSearch} {disabled} color="light">Clear</Button>
  </div>

  {#if showSuggestionsPanel}
    <div
      class="absolute z-50 w-full mt-1 bg-white dark:bg-brown-900 text-gray-900 dark:text-brown-100 rounded-lg"
    >
      {#each suggestionItems as suggestion, i}
        <button
          class="w-full px-4 py-2 text-left hover:bg-brown-100 dark:hover:bg-brown-800 flex items-center gap-2 {selectedIndex ===
          i
            ? 'bg-brown-100 dark:bg-brown-800'
            : ''} text-gray-900 dark:text-brown-100"
          onmousedown={() => selectSuggestion(suggestion)}
        >
          <span class="text-sm text-brown-500 dark:text-brown-300">
            {suggestion.type === "author" ? "Author:" : "Tag:"}
          </span>
          <span class="flex-grow">{suggestion.displayTitle}</span>
        </button>
      {/each}
    </div>
  {/if}

  {#if showFallbackToggle}
    <Checkbox
      bind:checked={useFallbackRelays}
      id="use-fallback-relays"
      {disabled}
    >
      Include fallback relays (may expose your data to additional relay
      operators)
    </Checkbox>
  {/if}

  {#if searchError}
    <div
      class="p-4 mb-4 text-sm text-red-700 bg-red-100 rounded-lg"
      role="alert"
    >
      {searchError.message}
    </div>
  {/if}
</div>
