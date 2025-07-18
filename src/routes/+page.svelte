<script lang="ts">
  import { Alert, Input } from "flowbite-svelte";
  import { HammerSolid } from "flowbite-svelte-icons";
  import { userStore } from "$lib/stores/userStore";
  import { activeInboxRelays, ndkSignedIn } from "$lib/ndk";
  import PublicationFeed from "$lib/components/publications/PublicationFeed.svelte";

  let searchQuery = $state("");
  let user = $derived($userStore);
  let eventCount = $state({ displayed: 0, total: 0 });

  function handleEventCountUpdate(counts: { displayed: number; total: number }) {
    eventCount = counts;
  }
</script>

<Alert
  rounded={false}
  id="alert-experimental"
  class="border-t-4 border-primary-600 text-gray-900 dark:text-gray-100 dark:border-primary-500 flex justify-left mb-2"
>
  <HammerSolid class="mr-2 h-5 w-5 text-primary-500 dark:text-primary-500" />
  <span class="font-medium">
    Pardon our dust! The publication view is currently using an experimental
    loader, and may be unstable.
  </span>
</Alert>

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
