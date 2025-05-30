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
  import { displayLimits } from "$lib/stores/displayLimits";
  import { filterByDisplayLimits, detectMissingEvents } from "$lib/utils/displayLimits";
  import type { PageData } from './$types';
  
  // Configuration
  const DEBUG = true; // Set to true to enable debug logging
  const INDEX_EVENT_KIND = 30040;
  const CONTENT_EVENT_KINDS = [30041, 30818];
  
  // Props from load function
  let { data } = $props<{ data: PageData }>();
  
  /**
   * Debug logging function that only logs when DEBUG is true
   */
  function debug(...args: any[]) {
    if (DEBUG) {
      console.log("[VisualizePage]", ...args);
    }
  }

  // State
  let allEvents = $state<NDKEvent[]>([]); // All fetched events
  let events = $state<NDKEvent[]>([]); // Events to display (filtered by limits)
  let loading = $state(true);
  let error = $state<string | null>(null);
  let showSettings = $state(false);
  let tagExpansionDepth = $state(0);
  let baseEvents = $state<NDKEvent[]>([]); // Store original events before expansion
  let missingEventIds = $state(new Set<string>()); // Track missing referenced events

  /**
   * Fetches events from the Nostr network
   * 
   * This function fetches index events and their referenced content events,
   * filters them according to NIP-62, and combines them for visualization.
   */
  async function fetchEvents() {
    debug("Fetching events with limit:", $networkFetchLimit);
    debug("Event ID from URL:", data.eventId);
    try {
      loading = true;
      error = null;

      let validIndexEvents: Set<NDKEvent>;

      if (data.eventId) {
        // Fetch specific publication
        debug(`Fetching specific publication: ${data.eventId}`);
        const event = await $ndkInstance.fetchEvent(data.eventId);
        
        if (!event) {
          throw new Error(`Publication not found: ${data.eventId}`);
        }
        
        if (event.kind !== INDEX_EVENT_KIND) {
          throw new Error(`Event ${data.eventId} is not a publication index (kind ${INDEX_EVENT_KIND})`);
        }
        
        validIndexEvents = new Set([event]);
      } else {
        // Original behavior: fetch all publications
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

        // Filter valid index events according to NIP-62
        validIndexEvents = filterValidIndexEvents(indexEvents);
        debug("Valid index events after filtering:", validIndexEvents.size);
      }

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
      allEvents = [...Array.from(validIndexEvents), ...Array.from(contentEvents)];
      baseEvents = [...allEvents]; // Store base events for tag expansion
      
      // Step 6: Apply display limits
      events = filterByDisplayLimits(allEvents, $displayLimits);
      
      // Step 7: Detect missing events
      const eventIds = new Set(allEvents.map(e => e.id));
      missingEventIds = detectMissingEvents(events, eventIds);
      
      debug("Total events fetched:", allEvents.length);
      debug("Events displayed:", events.length);
      debug("Missing event IDs:", missingEventIds.size);
      debug("Display limits:", $displayLimits);
      debug("About to set loading to false");
      debug("Current loading state:", loading);
    } catch (e) {
      console.error("Error fetching events:", e);
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
      debug("Loading set to false in fetchEvents");
      debug("Final state check - loading:", loading, "events.length:", events.length, "allEvents.length:", allEvents.length);
    }
  }


  /**
   * Handles tag expansion to fetch related publications
   */
  async function handleTagExpansion(depth: number, tags: string[]) {
    debug("Handling tag expansion", { depth, tags });
    
    if (depth === 0 || tags.length === 0) {
      // Reset to base events only
      allEvents = [...baseEvents];
      events = filterByDisplayLimits(allEvents, $displayLimits);
      return;
    }
    
    try {
      // Don't show loading spinner for incremental updates
      error = null;
      
      // Keep track of existing event IDs to avoid duplicates
      const existingEventIds = new Set(baseEvents.map(e => e.id));
      
      // Fetch publications that have any of the specified tags
      const taggedPublications = await $ndkInstance.fetchEvents({
        kinds: [INDEX_EVENT_KIND],
        "#t": tags, // Match any of these tags
        limit: 30 * depth // Reasonable limit based on depth
      });
      
      debug("Found tagged publications:", taggedPublications.size);
      
      // Filter to avoid duplicates
      const newPublications = Array.from(taggedPublications).filter(
        event => !existingEventIds.has(event.id)
      );
      
      // Extract content event IDs from new publications
      const contentEventIds = new Set<string>();
      const existingContentIds = new Set(
        baseEvents.filter(e => e.kind !== undefined && CONTENT_EVENT_KINDS.includes(e.kind)).map(e => e.id)
      );
      
      newPublications.forEach((event) => {
        const aTags = event.getMatchingTags("a");
        aTags.forEach((tag) => {
          const eventId = tag[3];
          if (eventId && !existingContentIds.has(eventId)) {
            contentEventIds.add(eventId);
          }
        });
      });
      
      // Fetch the content events
      let newContentEvents: NDKEvent[] = [];
      if (contentEventIds.size > 0) {
        const contentEventsSet = await $ndkInstance.fetchEvents({
          kinds: CONTENT_EVENT_KINDS,
          ids: Array.from(contentEventIds),
        });
        newContentEvents = Array.from(contentEventsSet);
      }
      
      // Combine all events: base events + new publications + new content
      allEvents = [
        ...baseEvents,
        ...newPublications,
        ...newContentEvents
      ];
      
      // Apply display limits
      events = filterByDisplayLimits(allEvents, $displayLimits);
      
      // Update missing events detection
      const eventIds = new Set(allEvents.map(e => e.id));
      missingEventIds = detectMissingEvents(events, eventIds);
      
      debug("Events after expansion:", {
        base: baseEvents.length,
        newPubs: newPublications.length,
        newContent: newContentEvents.length,
        totalFetched: allEvents.length,
        displayed: events.length,
        missing: missingEventIds.size
      });
      
    } catch (e) {
      console.error("Error expanding tags:", e);
      error = e instanceof Error ? e.message : String(e);
    }
  }

  /**
   * Dynamically fetches missing events when "fetch if not found" is enabled
   */
  async function fetchMissingEvents(missingIds: string[]) {
    if (!$displayLimits.fetchIfNotFound || missingIds.length === 0) {
      return;
    }
    
    debug("Fetching missing events:", missingIds);
    debug("Current loading state:", loading);
    
    try {
      // Fetch by event IDs and d-tags
      const fetchedEvents = await $ndkInstance.fetchEvents({
        kinds: [...[INDEX_EVENT_KIND], ...CONTENT_EVENT_KINDS],
        "#d": missingIds, // For parameterized replaceable events
      });
      
      if (fetchedEvents.size === 0) {
        // Try fetching by IDs directly
        const eventsByIds = await $ndkInstance.fetchEvents({
          ids: missingIds
        });
        // Add events from the second fetch to the first set
        eventsByIds.forEach(e => fetchedEvents.add(e));
      }
      
      if (fetchedEvents.size > 0) {
        debug(`Fetched ${fetchedEvents.size} missing events`);
        
        // Add to all events
        allEvents = [...allEvents, ...Array.from(fetchedEvents)];
        
        // Re-apply display limits
        events = filterByDisplayLimits(allEvents, $displayLimits);
        
        // Update missing events list
        const eventIds = new Set(allEvents.map(e => e.id));
        missingEventIds = detectMissingEvents(events, eventIds);
      }
    } catch (e) {
      console.error("Error fetching missing events:", e);
    }
  }

  // React to display limit changes
  $effect(() => {
    debug("Effect triggered: allEvents.length =", allEvents.length, "displayLimits =", $displayLimits);
    if (allEvents.length > 0) {
      const newEvents = filterByDisplayLimits(allEvents, $displayLimits);
      
      // Only update if actually different to avoid infinite loops
      if (newEvents.length !== events.length) {
        debug("Updating events due to display limit change:", events.length, "->", newEvents.length);
        events = newEvents;
        
        // Check for missing events when limits change
        const eventIds = new Set(allEvents.map(e => e.id));
        missingEventIds = detectMissingEvents(events, eventIds);
        
        debug("Effect: events filtered to", events.length, "missing:", missingEventIds.size);
      }
      
      // Auto-fetch if enabled (but be conservative to avoid infinite loops)
      if ($displayLimits.fetchIfNotFound && missingEventIds.size > 0 && missingEventIds.size < 20) {
        debug("Auto-fetching", missingEventIds.size, "missing events");
        fetchMissingEvents(Array.from(missingEventIds));
      }
    }
  });

  // Fetch events when component mounts
  onMount(() => {
    debug("Component mounted");
    fetchEvents();
  });
</script>

<div class="leather w-full p-4 relative">
  <!-- Header with title and settings button -->
  <div class="flex items-center mb-4">
    <h1 class="h-leather">
      {data.eventId ? 'Publication Visualization' : 'Publication Network'}
    </h1>
  </div>
  <!-- Loading spinner -->
  {#if loading}
    <div class="flex justify-center items-center h-64">
      {debug("TEMPLATE: Loading is true, events.length =", events.length, "allEvents.length =", allEvents.length)}
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
    <EventNetwork 
      {events} 
      totalCount={allEvents.length}
      onupdate={fetchEvents} 
      onTagExpansionChange={handleTagExpansion}
      onFetchMissing={fetchMissingEvents}
    />
  {/if}
</div>
