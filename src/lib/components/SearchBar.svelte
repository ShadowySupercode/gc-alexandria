<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { Input, Button, Checkbox } from "flowbite-svelte";
  import { onMount, onDestroy } from 'svelte';
  import { searchStore } from '$lib/stores/searchStore';
  import type { NDKEvent } from '$lib/utils/nostrUtils';

  let { 
    placeholder = "Search...",
    initialValue = "",
    showFallbackToggle = false,
    initialFallbackValue = true,
    disabled = false,
    useFallbackRelays = $bindable(initialFallbackValue)
  } = $props<{
    placeholder?: string;
    initialValue?: string;
    showFallbackToggle?: boolean;
    initialFallbackValue?: boolean;
    disabled?: boolean;
    useFallbackRelays?: boolean;
  }>();

  // Events
  const dispatch = createEventDispatcher<{
    search: { query: string; useFallbackRelays: boolean };
    clear: void;
    cancel: void;
  }>();

  // State from store
  let searchInput = $state(initialValue);
  let isSearching = $state(false);
  let suggestions = $state<Array<{ text: string; type: 'title' | 'author' | 'tag'; score: number }>>([]);
  let searchError = $state<{ message: string; code: string } | null>(null);

  // Subscribe to store updates
  const unsubscribe = searchStore.subscribe(state => {
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
  type ButtonColor = "red" | "primary" | "green" | "yellow" | "purple" | "blue" | "light" | "dark" | "none" | "alternative";
  
  // Convert more state variables to derived values
  let hasQuery = $derived.by(() => 
    searchInput.trim().length > 0
  );

  let hasSuggestions = $derived.by(() => 
    suggestions.length > 0
  );

  let showSuggestionsPanel = $derived.by(() => 
    showSuggestions && hasSuggestions
  );

  let searchButtonState = $derived.by(() => ({
    text: isSearching ? 'Cancel' : 'Search',
    color: isSearching ? 'red' : 'primary' as ButtonColor,
    disabled: !hasQuery && !isSearching
  }));

  let suggestionItems = $derived.by(() => 
    suggestions.map(suggestion => ({
      ...suggestion,
      displayTitle: suggestion.text || 'Untitled',
      displayAuthor: suggestion.type === 'author' ? suggestion.text : 'Unknown Author'
    }))
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
      dispatch('cancel');
      return;
    }
    
    dispatch('search', { 
      query: searchInput.trim(), 
      useFallbackRelays 
    });
  }

  // Function to clear search
  function clearSearch() {
    if (isSearching) {
      dispatch('cancel');
    }
    searchStore.clearSearch();
    dispatch('clear');
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
  function selectSuggestion(suggestion: { text: string; type: 'title' | 'author' | 'tag' }) {
    searchStore.update(state => ({ ...state, query: suggestion.text }));
    performSearch();
  }

  // Function to handle keyboard navigation
  function handleKeydown(e: KeyboardEvent) {
    if (!showSuggestions) {
      if (e.key === 'Enter') {
        performSearch();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, suggestions.length - 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          selectSuggestion(suggestions[selectedIndex]);
        } else {
          performSearch();
        }
        break;
      case 'Escape':
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
    searchStore.update(state => ({ ...state, isSearching: false }));
  }
</script>

<div class="flex flex-col gap-4 relative">
  <div class="flex gap-2">
    <div class="relative flex-grow">
      <input
        type="text"
        bind:value={searchInput}
        {placeholder}
        {disabled}
        oninput={handleInput}
        onkeydown={handleKeydown}
        onfocus={() => showSuggestions = true}
        onblur={() => setTimeout(() => showSuggestions = false, 200)}
        class="w-full px-3 py-2 rounded bg-white dark:bg-brown-900 text-gray-900 dark:text-brown-100 border border-brown-500 dark:border-brown-300 placeholder-brown-400 dark:placeholder-brown-200 focus:ring-2 focus:ring-brown-400"
      />
      {#if showSuggestionsPanel}
        <div class="absolute z-50 w-full mt-1 bg-white dark:bg-brown-900 text-gray-900 dark:text-brown-100 rounded-lg shadow-lg border border-brown-300 dark:border-brown-700">
          {#each suggestionItems as suggestion, i}
            <button
              class="w-full px-4 py-2 text-left hover:bg-brown-100 dark:hover:bg-brown-800 flex items-center gap-2 {selectedIndex === i ? 'bg-brown-100 dark:bg-brown-800' : ''} text-gray-900 dark:text-brown-100"
              onmousedown={() => selectSuggestion(suggestion)}
            >
              <span class="text-sm text-brown-500 dark:text-brown-300">
                {suggestion.type === 'author' ? 'Author:' : 'Tag:'}
              </span>
              <span class="flex-grow">{suggestion.displayTitle}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
    <button
      onclick={performSearch}
      disabled={disabled}
      class="px-4 py-2 rounded bg-brown-800 dark:bg-brown-700 text-white dark:text-brown-100 border border-brown-700 dark:border-brown-300 hover:bg-brown-900 dark:hover:bg-brown-600 focus:ring-2 focus:ring-brown-400 transition disabled:opacity-50"
    >
      {searchButtonState.text}
    </button>
    <button
      onclick={clearSearch}
      disabled={disabled}
      class="px-4 py-2 rounded bg-brown-100 dark:bg-brown-900 text-brown-900 dark:text-brown-100 border border-brown-300 dark:border-brown-700 hover:bg-brown-200 dark:hover:bg-brown-800 focus:ring-2 focus:ring-brown-400 transition disabled:opacity-50"
    >
      Clear
    </button>
  </div>

  {#if showFallbackToggle}
    <div class="flex items-center gap-2">
      <input
        type="checkbox"
        bind:checked={useFallbackRelays}
        id="use-fallback-relays"
        {disabled}
        class="form-checkbox h-5 w-5 accent-brown-700 dark:accent-brown-400 bg-white dark:bg-brown-800 border-brown-300 dark:border-brown-700 rounded focus:ring-brown-400"
      />
      <label for="use-fallback-relays" class="text-sm text-gray-900 dark:text-gray-100">
        Include fallback relays (may expose your data to additional relay operators)
      </label>
    </div>
  {/if}

  {#if searchError}
    <div class="p-4 mb-4 text-sm text-red-700 bg-red-100 rounded-lg" role="alert">
      {searchError.message}
    </div>
  {/if}
</div> 