<script lang="ts">
  import { Input, Checkbox } from "flowbite-svelte";
  import PublicationFeed from "$lib/components/publications/PublicationFeed.svelte";
  import { userStore } from "$lib/stores/userStore.ts";

  let searchQuery = $state("");
  let showOnlyMyPublications = $state(false);
  let eventCount = $state({ displayed: 0, total: 0 });

  function handleEventCountUpdate(counts: { displayed: number; total: number }) {
    eventCount = counts;
  }
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
          <Checkbox
            bind:checked={showOnlyMyPublications}
            id="show-my-publications"
          />
          <label for="show-my-publications" class="text-sm cursor-pointer">
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
