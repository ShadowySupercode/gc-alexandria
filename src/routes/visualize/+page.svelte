<script lang="ts">
  import { onMount } from "svelte";
  import EventNetwork from "$lib/navigator/EventNetwork/index.svelte";
  import { ndkInstance } from "$lib/ndk";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";
  import { filterValidIndexEvents } from "$lib/utils";
  import EventLimitControl from "$lib/components/EventLimitControl.svelte";
  import EventRenderLevelLimit from "$lib/components/EventRenderLevelLimit.svelte";

  import { networkFetchLimit } from "$lib/state";
  import { fly } from "svelte/transition";
  import { quintOut } from "svelte/easing";
  import { CogSolid } from "flowbite-svelte-icons";
  import { Button, Tooltip } from "flowbite-svelte";

  let events: NDKEvent[] = [];
  let loading = true;
  let error: string | null = null;
  // panel visibility
  let showSettings = false;

  async function fetchEvents() {
    try {
      loading = true;
      error = null;

      // Fetch both index and content events
      const indexEvents = await $ndkInstance.fetchEvents(
        { kinds: [30040], limit: $networkFetchLimit },
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
        event.getMatchingTags("a").forEach((tag) => {
          let eventId = tag[3];
          contentEventIds.add(eventId);
        });
      });

      // Fetch the referenced content events
      const contentEvents = await $ndkInstance.fetchEvents(
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
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  function handleLimitUpdate() {
    fetchEvents();
  }

  onMount(() => {
    fetchEvents();
  });
</script>

<div class="leather w-full p-4 relative">
  <h1 class="h-leather text-2xl font-bold mb-4">Publication Network</h1>
  <!-- Settings Toggle Button -->

  <!-- Settings Button - Using Flowbite Components -->
  {#if !loading && !error}
    <Button
      class="btn-leather fixed right-4 top-24 z-40 rounded-lg min-w-[150px]"
      size="sm"
      on:click={() => (showSettings = !showSettings)}
    >
      <CogSolid class="mr-2 h-5 w-5" />
      Settings
    </Button>

    <!-- Settings Panel -->
    {#if showSettings}
      <div
        class="fixed right-0 top-[140px] h-auto w-80 bg-white dark:bg-gray-800 p-4 shadow-lg z-30
               overflow-y-auto max-h-[calc(100vh-96px)] rounded-l-lg border-l border-t border-b
               border-gray-200 dark:border-gray-700"
        transition:fly={{ duration: 300, x: 320, opacity: 1, easing: quintOut }}
      >
        <div class="card space-y-4">
          <h2 class="text-xl font-bold mb-4 h-leather">
            Visualization Settings
          </h2>

          <div class="space-y-4">
            <span class="text-sm text-gray-600 dark:text-gray-400">
              Showing {events.length} events from {$networkFetchLimit} headers
            </span>
            <EventLimitControl on:update={handleLimitUpdate} />
            <EventRenderLevelLimit on:update={handleLimitUpdate} />
          </div>
        </div>
      </div>
    {/if}
  {/if}
  {#if loading}
    <div class="flex justify-center items-center h-64">
      <div role="status">
        <svg
          aria-hidden="true"
          class="w-8 h-8 text-gray-200 animate-spin dark:text-gray-600 fill-blue-600"
          viewBox="0 0 100 101"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z"
            fill="currentColor"
          />
          <path
            d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z"
            fill="currentFill"
          />
        </svg>
        <span class="sr-only">Loading...</span>
      </div>
    </div>
  {:else if error}
    <div
      class="p-4 mb-4 text-sm text-red-800 rounded-lg bg-red-50 dark:bg-red-900 dark:text-red-400"
      role="alert"
    >
      <p>Error loading network: {error}</p>
      <button
        type="button"
        class="text-white bg-red-700 hover:bg-red-800 focus:ring-4 focus:ring-red-300 font-medium rounded-lg text-sm px-5 py-2.5 mt-2 dark:bg-red-600 dark:hover:bg-red-700 focus:outline-none dark:focus:ring-red-800"
        on:click={fetchEvents}
      >
        Retry
      </button>
    </div>
  {:else}
    <EventNetwork {events} />
    <div class="mt-8 prose dark:prose-invert max-w-none" />
  {/if}
</div>