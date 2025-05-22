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
      <Input
        bind:value={searchInput}
        {placeholder}
        class="w-full"
        {disabled}
        on:input={handleInput}
        on:keydown={handleKeydown}
        on:focus={() => showSuggestions = true}
        on:blur={() => setTimeout(() => showSuggestions = false, 200)}
      />
      {#if showSuggestionsPanel}
        <div class="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
          {#each suggestionItems as suggestion, i}
            <button
              class="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 {selectedIndex === i ? 'bg-gray-100 dark:bg-gray-700' : ''}"
              onmousedown={() => selectSuggestion(suggestion)}
            >
              <span class="text-sm text-gray-500 dark:text-gray-400">
                {suggestion.type === 'author' ? 'Author:' : 'Tag:'}
              </span>
              <span class="flex-grow">{suggestion.displayTitle}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
    <Button 
      onclick={performSearch} 
      disabled={disabled}
      color={searchButtonState.color}
    >
      {searchButtonState.text}
    </Button>
    <Button 
      color="alternative" 
      onclick={clearSearch} 
      disabled={disabled}
    >
      Clear
    </Button>
  </div>

  {#if showFallbackToggle}
    <div class="flex items-center gap-2">
      <Checkbox
        bind:checked={useFallbackRelays}
        id="use-fallback-relays"
        {disabled}
      />
      <label for="use-fallback-relays" class="text-sm text-gray-600 dark:text-gray-400">
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