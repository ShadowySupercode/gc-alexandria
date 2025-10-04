<script lang="ts">
  /**
   * @fileoverview ASearchForm Component - Alexandria
   *
   * A search form component with loading states, keyboard handling, and flexible callback system.
   * Provides a standardized search interface with clear functionality and user feedback.
   *
   * @component
   * @category Forms
   *
   * @prop {string} searchQuery - The current search query text (bindable)
   * @prop {boolean} searching - Whether a search is currently in progress
   * @prop {boolean} loading - Whether data is being loaded
   * @prop {boolean} isUserEditing - Whether user is actively editing the query (bindable)
   * @prop {string} [placeholder] - Placeholder text for the search input
   * @prop {(args: {clearInput: boolean, queryOverride?: string}) => void} [search] - Search callback
   * @prop {() => void} [clear] - Clear callback
   *
   * @example
   * ```svelte
   * <ASearchForm
   *   bind:searchQuery={query}
   *   {searching}
   *   {loading}
   *   bind:isUserEditing={editing}
   *   search={handleSearch}
   *   clear={handleClear}
   * />
   * ```
   *
   * @example Basic search form
   * ```svelte
   * <ASearchForm
   *   bind:searchQuery={searchTerm}
   *   searching={isSearching}
   *   search={performSearch}
   *   clear={clearResults}
   * />
   * ```
   *
   * @example Custom placeholder and editing tracking
   * ```svelte
   * <ASearchForm
   *   bind:searchQuery={query}
   *   bind:isUserEditing={userTyping}
   *   searching={searching}
   *   placeholder="Search events, users, topics..."
   *   search={handleEventSearch}
   *   clear={resetSearch}
   * />
   * ```
   *
   * @features
   * - Enter key triggers search
   * - Loading spinner during operations
   * - Clear button functionality
   * - User editing state tracking
   * - Flexible callback system
   * - Accessible search interface
   *
   * @accessibility
   * - Keyboard accessible (Enter to search)
   * - Screen reader friendly with proper labels
   * - Loading states clearly communicated
   * - Focus management
   */

  import { Button, Search, Spinner } from "flowbite-svelte";

  // AI-NOTE: 2025-08-16 - This component centralizes search form behavior.
  // Parent supplies callbacks `search` and `clear`. Two-way bindings use $bindable.
  let {
    searchQuery = $bindable(""),
    searching = false,
    loading = false,
    isUserEditing = $bindable(false),
    placeholder = "Enter event ID, nevent, naddr, d:tag-name, t:topic, or n:username...",
    search,
    clear,
  }: {
    searchQuery: string;
    searching: boolean;
    loading: boolean;
    isUserEditing: boolean;
    placeholder?: string;
    search?: (args: { clearInput: boolean; queryOverride?: string }) => void;
    clear?: () => void;
  } = $props();

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === "Enter") {
      search?.({ clearInput: true });
    }
  }

  function triggerSearch(): void {
    search?.({ clearInput: true });
  }

  function handleInput(): void {
    isUserEditing = true;
  }

  function handleBlur(): void {
    isUserEditing = false;
  }

  function handleClear(): void {
    clear?.();
  }
</script>

<form id="search-form" class="flex gap-2">
  <Search
    id="search-input"
    class="justify-center"
    bind:value={searchQuery}
    onkeydown={handleKeydown}
    oninput={handleInput}
    onblur={handleBlur}
    {placeholder}
  />
  <Button onclick={triggerSearch} disabled={loading}>
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
</form>
