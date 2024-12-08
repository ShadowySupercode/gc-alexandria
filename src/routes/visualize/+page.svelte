<script lang="ts">
  import { onMount } from "svelte";
  import EventNetwork from "$lib/components/EventNetwork.svelte";
  import { ndk } from "$lib/ndk";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";
  import { filterValidIndexEvents } from "$lib/utils";

  let events: NDKEvent[] = [];
  let loading = true;
  let error: string | null = null;

  async function fetchEvents() {
    try {
      loading = true;
      error = null;

      // Fetch both index and content events
      const indexEvents = await $ndk.fetchEvents(
        { kinds: [30040] },
        {
          groupable: true,
          skipVerification: false,
          skipValidation: false,
        },
      );

      // Filter valid index events according to NIP-62
      const validIndexEvents = filterValidIndexEvents(indexEvents);

      // Get all the content event IDs referenced by the index events
      const contentEventIds = new Set<string>();
      validIndexEvents.forEach((event) => {
        event.getMatchingTags("e").forEach((tag) => {
          contentEventIds.add(tag[1]);
        });
      });

      // Fetch the referenced content events
      const contentEvents = await $ndk.fetchEvents(
        {
          kinds: [30041],
          ids: Array.from(contentEventIds),
        },
        {
          groupable: true,
          skipVerification: false,
          skipValidation: false,
        },
      );

      // Combine both sets of events
      events = [...Array.from(validIndexEvents), ...Array.from(contentEvents)];
    } catch (e) {
      console.error("Error fetching events:", e);
      error = e.message;
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    fetchEvents();
  });
</script>

<div class="leather w-full p-4">
  <h1 class="h-leather text-2xl font-bold mb-4">Publication Network</h1>

  {#if loading}
    <div class="flex justify-center items-center h-64">
      <p class="text-gray-600 dark:text-gray-400">Loading network data...</p>
    </div>
  {:else if error}
    <div
      class="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-600
                text-red-700 dark:text-red-300 px-4 py-3 rounded"
    >
      <p>Error loading network: {error}</p>
      <button class="btn-leather mt-2 px-4 py-2 rounded" on:click={fetchEvents}>
        Retry
      </button>
    </div>
  {:else}
    <EventNetwork {events} />

    <div class="mt-8 prose dark:prose-invert max-w-none">
      <!-- Legend section with proper styling -->
      <h2 class="h-leather">About This Visualization</h2>
      <!-- ... rest of the content ... -->
    </div>
  {/if}
</div>
