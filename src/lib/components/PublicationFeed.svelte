<script lang="ts">
  import { Button, Spinner } from "flowbite-svelte";
  import type { NostrEvent } from '$lib/types/nostr';
  import PublicationHeader from "$components/cards/PublicationHeader.svelte";
  import { naddrEncode } from '$lib/utils/identifierUtils';
  import CardActions from "$components/util/CardActions.svelte";
  import PublicationSearch from "./PublicationSearch.svelte";
  import { getNostrClient } from '$lib/nostr/client';
  import { selectedRelayGroup } from '$lib/utils/relayGroupUtils';
  import { onMount } from 'svelte';
  import { indexKind } from '$lib/consts';
  import { filterValidIndexEvents } from '$lib/utils/eventUtils';
  import type { NostrFilter } from '$lib/types/nostr';
  import { withTimeout } from '$lib/utils/commonUtils';

  let {
    searchQuery = "",
  } = $props<{
    searchQuery?: string;
  }>();

  let eventsInView: NostrEvent[] = $state([]);
  let loadingMore: boolean = $state(false);
  let endOfFeed: boolean = $state(false);
  let loading: boolean = $state(true);
  let searchError = $state<{ message: string; code: string } | null>(null);
  let searchProgress = $state<{ processed: number; total: number; percentage: number } | null>(null);
  let lastEventTimestamp: number | undefined = $state(undefined);
  let totalPublications = $state<number | null>(null);

  // Convert more state variables to derived values
  let isLoading = $derived.by(() => loading || loadingMore);
  let canLoadMore = $derived.by(() => !endOfFeed && !isLoading);
  let currentRange = $derived.by(() => {
    if (eventsInView.length === 0) return '';
    if (eventsInView.length === 1) return '1';
    return `1-${eventsInView.length}`;
  });

  // Get the active relay set based on user settings
  let activeRelays = $derived.by(() => $selectedRelayGroup.inbox);

  async function fetchFeedEvents(until?: number) {
    const client = getNostrClient($selectedRelayGroup.inbox);
    if (!client) return;

    try {
      const filter: NostrFilter = {
        kinds: [indexKind],
        limit: 20,
        until,
      };

      let events: NostrEvent[] = [];
      try {
        events = await withTimeout(client.fetchEvents(filter), 5000);
      } catch (err) {
        events = [];
      }
      const validEvents = filterValidIndexEvents(new Set(events));
      const sortedEvents = Array.from(validEvents).sort((a, b) => b.created_at - a.created_at);

      if (sortedEvents.length > 0) {
        lastEventTimestamp = sortedEvents[sortedEvents.length - 1].created_at;
        if (until) {
          eventsInView = [...eventsInView, ...sortedEvents];
        } else {
          eventsInView = sortedEvents;
          // Set total count on initial load
          totalPublications = sortedEvents.length;
        }
        endOfFeed = sortedEvents.length < 20;
      } else {
        endOfFeed = true;
      }
    } catch (err) {
      console.error('Error fetching feed events:', err);
      searchError = { message: 'Failed to fetch feed events', code: 'FEED_ERROR' };
    } finally {
      loading = false;
      loadingMore = false;
    }
  }

  function handleSearchResults(events: NostrEvent[]) {
    eventsInView = events;
    totalPublications = events.length;
    loading = false;
    endOfFeed = true; // Disable load more when searching
  }

  function handleSearchError(error: { message: string; code: string } | null) {
    searchError = error;
  }

  function handleSearchProgress(progress: { processed: number; total: number; percentage: number } | null) {
    searchProgress = progress;
  }

  async function loadMore() {
    if (!canLoadMore || !lastEventTimestamp) return;
    loadingMore = true;
    await fetchFeedEvents(lastEventTimestamp);
  }

  onMount(async () => {
    if (!searchQuery) {
      await fetchFeedEvents();
    }
  });

  // Reset feed when search query changes
  $effect(() => {
    if (searchQuery) {
      // Let PublicationSearch handle the search
      loading = true;
      endOfFeed = true;
      totalPublications = null;
    } else {
      // Reset and fetch feed
      eventsInView = [];
      lastEventTimestamp = undefined;
      endOfFeed = false;
      totalPublications = null;
      fetchFeedEvents();
    }
  });

  async function search(
    before: number | undefined = undefined,
    search: string = "",
    relays: string[] = $selectedRelayGroup.inbox,
    signal?: AbortSignal,
    options: { relayTimeout?: number } = {},
  ) {
    const client = getNostrClient($selectedRelayGroup.inbox);
    if (!client) return [];

    try {
      const filter: NostrFilter = {
        kinds: [indexKind],
        limit: 20,
        until: before,
        search,
      };

      let events: NostrEvent[] = [];
      try {
        events = await withTimeout(client.fetchEvents(filter), 5000);
      } catch (err) {
        events = [];
      }
      const validEvents = filterValidIndexEvents(new Set(events));
      return Array.from(filterValidIndexEvents(new Set(events)));
    } catch (err) {
      console.error('Error searching events:', err);
      return [];
    }
  }
</script>

<!-- Controls White Box -->
<div class="mx-auto w-full max-w-3xl">
  <PublicationSearch
    {searchQuery}
    onSearchResults={handleSearchResults}
    onSearchError={handleSearchError}
    onSearchProgress={handleSearchProgress}
  />
</div>

<!-- Publication Count and Range Display -->
{#if !loading && eventsInView.length > 0}
  <div class="max-w-6xl mx-auto mt-4 px-4">
    <p class="text-sm text-gray-600 dark:text-gray-400">
      {#if searchQuery}
        Found {totalPublications} publication{#if totalPublications !== 1}s{/if} matching "{searchQuery}"
      {:else}
        Showing publications {currentRange} of {totalPublications}
      {/if}
    </p>
  </div>
{/if}

<!-- Publication Cards Grid and Results (outside the white box) -->
<div
  class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl mx-auto mt-8"
>
  {#if loading && eventsInView.length === 0}
    <div class="flex justify-center items-center col-span-full py-8">
      <Spinner size="sm" />
    </div>
  {:else if eventsInView.length > 0}
    {#each eventsInView as event (event.id)}
      <div class="relative h-full">
        <a href="/publication?id={naddrEncode(event, activeRelays)}" class="block h-full">
          <PublicationHeader {event} />
        </a>
        <div class="absolute top-2 right-2 z-10">
          <CardActions {event} />
        </div>
      </div>
    {/each}
    {#if canLoadMore}
      <div class="flex justify-center mt-6 col-span-full">
        <Button
          color="primary"
          class="rounded-lg px-6 py-2"
          onclick={loadMore}
        >
          Load More
        </Button>
      </div>
    {/if}
  {:else if searchQuery.trim()}
    <div class="col-span-full">
      <p class="text-center text-gray-900 dark:text-gray-100">
        No publications found matching "{searchQuery}".
      </p>
    </div>
  {:else}
    <div class="col-span-full">
      <p class="text-center text-gray-900 dark:text-gray-100">
        No publications found.
      </p>
    </div>
  {/if}
</div>
