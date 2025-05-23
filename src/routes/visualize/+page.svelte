<!--
  Visualization Page
  
  This page displays a network visualization of Nostr publications,
  showing the relationships between index events and their content.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import EventNetwork from "$lib/navigator/EventNetwork/index.svelte";
  import { ndkInstance } from "$lib/ndk";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";
  import { filterValidIndexEvents } from "$lib/utils";
  import { networkFetchLimit } from "$lib/state";
  
  // Configuration
  const DEBUG = false; // Set to true to enable debug logging
  const INDEX_EVENT_KIND = 30040;
  const CONTENT_EVENT_KINDS = [30041, 30818];
  
  /**
   * Debug logging function that only logs when DEBUG is true
   */
  function debug(...args: any[]) {
    if (DEBUG) {
      console.log("[VisualizePage]", ...args);
    }
  }

  // State
  let events: NDKEvent[] = [];
  let loading = true;
  let error: string | null = null;
  let showSettings = false;

  /**
   * Fetches events from the Nostr network
   * 
   * This function fetches index events and their referenced content events,
   * filters them according to NIP-62, and combines them for visualization.
   */
  async function fetchEvents() {
    debug("Fetching events with limit:", $networkFetchLimit);
    try {
      loading = true;
      error = null;

      // Step 1: Fetch index events
      debug(`Fetching index events (kind ${INDEX_EVENT_KIND})`);
      const indexEvents = await $ndkInstance.fetchEvents(
        { 
          kinds: [INDEX_EVENT_KIND], 
          limit: $networkFetchLimit 
        },
        {
          groupable: true,
          skipVerification: false,
          skipValidation: false,
        },
      );
      debug("Fetched index events:", indexEvents.size);

      // Step 2: Filter valid index events according to NIP-62
      const validIndexEvents = filterValidIndexEvents(indexEvents);
      debug("Valid index events after filtering:", validIndexEvents.size);

      // Step 3: Extract content event IDs from index events
      const contentEventIds = new Set<string>();
      validIndexEvents.forEach((event) => {
        const aTags = event.getMatchingTags("a");
        debug(`Event ${event.id} has ${aTags.length} a-tags`);
        
        aTags.forEach((tag) => {
          const eventId = tag[3];
          if (eventId) {
            contentEventIds.add(eventId);
          }
        });
      });
      debug("Content event IDs to fetch:", contentEventIds.size);

      // Step 4: Fetch the referenced content events
      debug(`Fetching content events (kinds ${CONTENT_EVENT_KINDS.join(', ')})`);
      const contentEvents = await $ndkInstance.fetchEvents(
        {
          kinds: CONTENT_EVENT_KINDS,
          ids: Array.from(contentEventIds),
        },
        {
          groupable: true,
          skipVerification: false,
          skipValidation: false,
        },
      );
      debug("Fetched content events:", contentEvents.size);

      // Step 5: Combine both sets of events
      events = [...Array.from(validIndexEvents), ...Array.from(contentEvents)];
      debug("Total events for visualization:", events.length);
    } catch (e) {
      console.error("Error fetching events:", e);
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }


  // Fetch events when component mounts
  onMount(() => {
    debug("Component mounted");
    fetchEvents();
  });
</script>

<div class="leather w-full p-4 relative">
  <!-- Header with title and settings button -->
  <div class="flex items-center mb-4">
    <h1 class="h-leather">Publication Network</h1>
  </div>
  <!-- Loading spinner -->
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
  <!-- Error message -->
  {:else if error}
    <div
      class="p-4 mb-4 text-sm text-red-800 rounded-lg bg-red-50 dark:bg-red-900 dark:text-red-400"
      role="alert"
    >
      <p class="font-bold mb-2">Error loading network:</p>
      <p class="mb-3">{error}</p>
      <button
        type="button"
        class="text-white bg-red-700 hover:bg-red-800 focus:ring-4 focus:ring-red-300 font-medium rounded-lg text-sm px-5 py-2.5 mt-2 dark:bg-red-600 dark:hover:bg-red-700 focus:outline-none dark:focus:ring-red-800"
        on:click={fetchEvents}
      >
        Retry
      </button>
    </div>
  <!-- Network visualization -->
  {:else}
    <!-- Event network visualization -->
    <EventNetwork {events} onupdate={fetchEvents} />
  {/if}
</div>
