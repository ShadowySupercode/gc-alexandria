<script lang="ts">
  import { Input } from "flowbite-svelte";
  import PublicationFeed from "$lib/components/publications/PublicationFeed.svelte";

  let searchQuery = $state("");
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
    <div class="text-center text-sm text-gray-600 dark:text-gray-400">
      Showing {eventCount.displayed} of {eventCount.total} events.
    </div>
  {/if}
  
  <PublicationFeed
    {searchQuery}
    onEventCountUpdate={handleEventCountUpdate}
  />
</main>
