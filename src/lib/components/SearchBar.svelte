<script lang="ts">
  import { Button, Input } from "flowbite-svelte";

  const {
    placeholder = "Search...",
    initialValue = "",
    showFallbackToggle = false,
    searchDisabled = false,
    clearDisabled = false,
    isSearching = false,
    onDispatchSearch = (query: string) => {},
    onDispatchCancel = () => {},
    onDispatchClear = () => {},
  } = $props<{
    placeholder?: string;
    initialValue?: string;
    showFallbackToggle?: boolean;
    searchDisabled?: boolean;
    clearDisabled?: boolean;
    isSearching?: boolean;
    onDispatchSearch?: (query: string) => void;
    onDispatchCancel?: () => void;
    onDispatchClear?: () => void;
  }>();

  let searchValue = $state(initialValue);
  let useFallbackRelays = $state(false);

  // Load saved preferences from localStorage
  $effect(() => {
    if (typeof window !== 'undefined') {
      useFallbackRelays = localStorage.getItem('useFallbackRelays') === 'true';
    }
  });

  function handleSearch() {
    if (searchValue.trim()) {
      onDispatchSearch(searchValue.trim());
    }
  }

  function handleClear() {
    searchValue = "";
    onDispatchClear();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      handleSearch();
    } else if (event.key === "Escape") {
      onDispatchCancel();
    }
  }
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
