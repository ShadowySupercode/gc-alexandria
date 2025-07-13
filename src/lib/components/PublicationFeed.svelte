<script lang="ts">
  import { indexKind } from "$lib/consts";
  import { ndkInstance } from "$lib/ndk";
  import { filterValidIndexEvents, debounce } from "$lib/utils";
  import { Button, P, Skeleton, Spinner } from "flowbite-svelte";
  import ArticleHeader from "./PublicationHeader.svelte";
  import { onMount } from "svelte";
  import {
    getMatchingTags,
    NDKRelaySetFromNDK,
    type NDKEvent,
    type NDKRelaySet,
  } from "$lib/utils/nostrUtils";

  let {
    relays,
    fallbackRelays,
    searchQuery = "",
  } = $props<{
    relays: string[];
    fallbackRelays: string[];
    searchQuery?: string;
  }>();

  let eventsInView: NDKEvent[] = $state([]);
  let loadingMore: boolean = $state(false);
  let endOfFeed: boolean = $state(false);
  let relayStatuses = $state<Record<string, "pending" | "found" | "notfound">>(
    {},
  );
  let loading: boolean = $state(true);

  let cutoffTimestamp: number = $derived(
    eventsInView?.at(eventsInView.length - 1)?.created_at ??
      new Date().getTime(),
  );

  let allIndexEvents: NDKEvent[] = $state([]);

  async function fetchAllIndexEventsFromRelays() {
    loading = true;
    const ndk = $ndkInstance;
    const primaryRelays: string[] = relays;
    const fallback: string[] = fallbackRelays.filter(
      (r: string) => !primaryRelays.includes(r),
    );
    const allRelays = [...primaryRelays, ...fallback];
    relayStatuses = Object.fromEntries(
      allRelays.map((r: string) => [r, "pending"]),
    );
    let allEvents: NDKEvent[] = [];

    // Helper to fetch from a single relay with timeout
    async function fetchFromRelay(relay: string): Promise<NDKEvent[]> {
      try {
        const relaySet = NDKRelaySetFromNDK.fromRelayUrls([relay], ndk);
        let eventSet = await ndk
          .fetchEvents(
            {
              kinds: [indexKind],
            },
            {
              groupable: false,
              skipVerification: false,
              skipValidation: false,
            },
            relaySet,
          )
          .withTimeout(5000);
        eventSet = filterValidIndexEvents(eventSet);
        relayStatuses = { ...relayStatuses, [relay]: "found" };
        return Array.from(eventSet);
      } catch (err) {
        console.error(`Error fetching from relay ${relay}:`, err);
        relayStatuses = { ...relayStatuses, [relay]: "notfound" };
        return [];
      }
    }

    // Fetch from all relays in parallel, do not block on any single relay
    const results = await Promise.allSettled(allRelays.map(fetchFromRelay));
    for (const result of results) {
      if (result.status === "fulfilled") {
        allEvents = allEvents.concat(result.value);
      }
    }
    // Deduplicate by tagAddress
    const eventMap = new Map(
      allEvents.map((event) => [event.tagAddress(), event]),
    );
    allIndexEvents = Array.from(eventMap.values());
    // Sort by created_at descending
    allIndexEvents.sort((a, b) => b.created_at! - a.created_at!);
    // Initially show first page
    eventsInView = allIndexEvents.slice(0, 30);
    endOfFeed = allIndexEvents.length <= 30;
    loading = false;
  }

  // Function to filter events based on search query
  const filterEventsBySearch = (events: NDKEvent[]) => {
    if (!searchQuery) return events;
    const query = searchQuery.toLowerCase();
    console.debug(
      "[PublicationFeed] Filtering events with query:",
      query,
      "Total events before filter:",
      events.length,
    );

    // Check if the query is a NIP-05 address
    const isNip05Query = /^[a-z0-9._-]+@[a-z0-9.-]+$/i.test(query);
    console.debug("[PublicationFeed] Is NIP-05 query:", isNip05Query);

    const filtered = events.filter((event) => {
      const title =
        getMatchingTags(event, "title")[0]?.[1]?.toLowerCase() ?? "";
      const authorName =
        getMatchingTags(event, "author")[0]?.[1]?.toLowerCase() ?? "";
      const authorPubkey = event.pubkey.toLowerCase();
      const nip05 =
        getMatchingTags(event, "nip05")[0]?.[1]?.toLowerCase() ?? "";

      // For NIP-05 queries, only match against NIP-05 tags
      if (isNip05Query) {
        const matches = nip05 === query;
        if (matches) {
          console.debug("[PublicationFeed] Event matches NIP-05 search:", {
            id: event.id,
            nip05,
            authorPubkey,
          });
        }
        return matches;
      }

      // For regular queries, match against all fields
      const matches =
        title.includes(query) ||
        authorName.includes(query) ||
        authorPubkey.includes(query) ||
        nip05.includes(query);
      if (matches) {
        console.debug("[PublicationFeed] Event matches search:", {
          id: event.id,
          title,
          authorName,
          authorPubkey,
          nip05,
        });
      }
      return matches;
    });
    console.debug("[PublicationFeed] Events after filtering:", filtered.length);
    return filtered;
  };

  // Debounced search function
  const debouncedSearch = debounce(async (query: string) => {
    console.debug("[PublicationFeed] Search query changed:", query);
    if (query.trim()) {
      const filtered = filterEventsBySearch(allIndexEvents);
      eventsInView = filtered.slice(0, 30);
      endOfFeed = filtered.length <= 30;
    } else {
      eventsInView = allIndexEvents.slice(0, 30);
      endOfFeed = allIndexEvents.length <= 30;
    }
  }, 300);

  $effect(() => {
    console.debug(
      "[PublicationFeed] Search query effect triggered:",
      searchQuery,
    );
    debouncedSearch(searchQuery);
  });

  async function loadMorePublications() {
    loadingMore = true;
    const current = eventsInView.length;
    let source = searchQuery.trim()
      ? filterEventsBySearch(allIndexEvents)
      : allIndexEvents;
    eventsInView = source.slice(0, current + 30);
    endOfFeed = eventsInView.length >= source.length;
    loadingMore = false;
  }

  function getSkeletonIds(): string[] {
    const skeletonHeight = 124; // The height of the skeleton component in pixels.
    const skeletonCount = Math.floor(window.innerHeight / skeletonHeight) - 2;
    const skeletonIds = [];
    for (let i = 0; i < skeletonCount; i++) {
      skeletonIds.push(`skeleton-${i}`);
    }
    return skeletonIds;
  }

  onMount(async () => {
    await fetchAllIndexEventsFromRelays();
  });
</script>

<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 w-full">
    {#if loading && eventsInView.length === 0}
      {#each getSkeletonIds() as id}
        <Skeleton divClass="skeleton-leather w-full" size="lg" />
      {/each}
    {:else if eventsInView.length > 0}
      {#each eventsInView as event}
        <ArticleHeader {event} />
      {/each}
    {:else}
      <div class="col-span-full">
        <p class="text-center">No publications found.</p>
      </div>
    {/if}
  </div>
  {#if !loadingMore && !endOfFeed}
    <div class="flex justify-center mt-4 mb-8">
      <Button
        outline
        class="w-full max-w-md"
        onclick={async () => {
          await loadMorePublications();
        }}
      >
        Show more publications
      </Button>
    </div>
  {:else if loadingMore}
    <div class="flex justify-center mt-4 mb-8">
      <Button outline disabled class="w-full max-w-md">
        <Spinner class="mr-3 text-gray-600 dark:text-gray-300" size="4" />
        Loading...
      </Button>
    </div>
  {:else}
    <div class="flex justify-center mt-4 mb-8">
      <P class="text-sm text-gray-700 dark:text-gray-300"
        >You've reached the end of the feed.</P
      >
    </div>
  {/if}
