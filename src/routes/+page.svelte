<script lang="ts">
  import { Input, Modal, Button } from "flowbite-svelte";
  import PublicationFeed from "$lib/components/publications/PublicationFeed.svelte";
  import { userStore } from "$lib/stores/userStore.ts";

  let searchQuery = $state("");
  let showOnlyMyPublications = $state(false);
  let eventCount = $state({ displayed: 0, total: 0 });
  let showClearSearchModal = $state(false);
  let pendingCheckboxState = $state(false);

  function handleEventCountUpdate(counts: { displayed: number; total: number }) {
    eventCount = counts;
  }

  // Debug: Log state changes
  $effect(() => {
    console.log('showOnlyMyPublications changed to:', showOnlyMyPublications);
  });

  function handleCheckboxChange(event: Event) {
    const target = event.target as HTMLInputElement;
    const newState = target.checked;
    
    // If checkbox is being checked and there's a search query, show confirmation
    if (newState && searchQuery.trim()) {
      pendingCheckboxState = newState;
      showClearSearchModal = true;
      // Revert the checkbox to its previous state
      target.checked = showOnlyMyPublications;
      return;
    } else {
      // If unchecking or no search query, proceed normally
      showOnlyMyPublications = newState;
    }
  }

  function confirmClearSearch() {
    searchQuery = "";
    showClearSearchModal = false;
    // Force the state update by reassigning
    showOnlyMyPublications = false;
    showOnlyMyPublications = true;
  }

  function cancelClearSearch() {
    // Don't change showOnlyMyPublications - it should remain as it was
    showClearSearchModal = false;
  }

  // AI-NOTE: Removed automatic search clearing - now handled with confirmation dialog
</script>

<main class="leather flex flex-col flex-grow-0 space-y-4 p-4">
  <div
    class="leather w-full flex flex-row items-center justify-center gap-4 mb-4"
  >
    <Input
      bind:value={searchQuery}
      placeholder="Search publications by title or author..."
      class="flex-grow max-w-2xl min-w-[300px] text-base"
    />
  </div>
  
  {#if eventCount.total > 0}
    <div class="flex items-center justify-center gap-4 text-sm text-gray-600 dark:text-gray-400">
      <span>Showing {eventCount.displayed} of {eventCount.total} events.</span>
      
      <!-- AI-NOTE: Show filter checkbox only when user is logged in -->
      {#if $userStore.signedIn}
        <div class="flex items-center gap-2">
          <input
            type="checkbox"
            checked={showOnlyMyPublications}
            onchange={handleCheckboxChange}
            id="show-my-publications"
            class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
          />
          <label for="show-my-publications" class="text-sm cursor-pointer text-gray-700 dark:text-gray-300">
            Show only my publications
          </label>
        </div>
      {/if}
    </div>
  {/if}
  
  <PublicationFeed
    {searchQuery}
    {showOnlyMyPublications}
    onEventCountUpdate={handleEventCountUpdate}
  />
</main>

<!-- Confirmation Modal -->
<Modal bind:open={showClearSearchModal} size="md">
  <div class="p-6">
    <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">
      Clear Search?
    </h3>
    <p class="text-sm text-gray-600 dark:text-gray-400 mb-6">
      Switching to "Show only my publications" will clear your current search. 
      Are you sure you want to continue?
    </p>
    <div class="flex justify-end gap-3">
      <Button color="light" onclick={cancelClearSearch}>
        Cancel
      </Button>
      <Button color="primary" onclick={confirmClearSearch}>
        Clear Search
      </Button>
    </div>
  </div>
</Modal>
