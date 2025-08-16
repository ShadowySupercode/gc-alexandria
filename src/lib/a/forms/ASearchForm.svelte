<script lang="ts">
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
