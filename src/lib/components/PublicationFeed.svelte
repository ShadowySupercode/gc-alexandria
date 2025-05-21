<script lang='ts'>
  import { indexKind } from '$lib/consts';
  import { ndkInstance } from '$lib/ndk';
  import { filterValidIndexEvents, debounce } from '$lib/utils';
  import { Button, P, Skeleton, Spinner } from 'flowbite-svelte';
  import ArticleHeader from './PublicationHeader.svelte';
  import { onMount } from 'svelte';
  import { getMatchingTags, NDKRelaySetFromNDK, type NDKEvent, type NDKRelaySet } from '$lib/utils/nostrUtils';

  let { relays, fallbackRelays, searchQuery = '' } = $props<{ relays: string[], fallbackRelays: string[], searchQuery?: string }>();

  let eventsInView: NDKEvent[] = $state([]);
  let loadingMore: boolean = $state(false);
  let endOfFeed: boolean = $state(false);
  let relayStatuses = $state<Record<string, 'pending' | 'found' | 'notfound'>>({});
  let loading: boolean = $state(true);

  let cutoffTimestamp: number = $derived(
    eventsInView?.at(eventsInView.length - 1)?.created_at ?? new Date().getTime()
  );

  // Debounced search function
  const debouncedSearch = debounce(async (query: string) => {
    if (query.trim()) {
      await getEvents(undefined, query);
    } else {
      await getEvents();
    }
  }, 300);

  $effect(() => {
    debouncedSearch(searchQuery);
  });

  async function getEvents(before: number | undefined = undefined, search: string = '') {
    loading = true;
    const ndk = $ndkInstance;
    const primaryRelays: string[] = relays;
    const fallback: string[] = fallbackRelays.filter((r: string) => !primaryRelays.includes(r));
    relayStatuses = Object.fromEntries(primaryRelays.map((r: string) => [r, 'pending']));
    let allEvents: NDKEvent[] = [];
    let fetchedCount = 0; // Track number of new events

    // Function to filter events based on search query
    const filterEventsBySearch = (events: NDKEvent[]) => {
      if (!search) return events;
      const query = search.toLowerCase();
      return events.filter(event => {
        const title = getMatchingTags(event, 'title')[0]?.[1]?.toLowerCase() ?? '';
        const author = event.pubkey.toLowerCase();
        return title.includes(query) || author.includes(query);
      });
    };

    // First, try primary relays
    await Promise.all(
      primaryRelays.map(async (relay: string) => {
        try {
          const relaySet = NDKRelaySetFromNDK.fromRelayUrls([relay], ndk);
          let eventSet = await ndk.fetchEvents(
            {
              kinds: [indexKind],
              limit: 30,
              until: before,
            },
            {
              groupable: false,
              skipVerification: false,
              skipValidation: false,
            },
            relaySet
          ).withTimeout(2500);
          eventSet = filterValidIndexEvents(eventSet);
          const eventArray = filterEventsBySearch(Array.from(eventSet));
          fetchedCount += eventArray.length; // Count new events
          if (eventArray.length > 0) {
            allEvents = allEvents.concat(eventArray);
            relayStatuses = { ...relayStatuses, [relay]: 'found' };
          } else {
            relayStatuses = { ...relayStatuses, [relay]: 'notfound' };
          }
        } catch {
          relayStatuses = { ...relayStatuses, [relay]: 'notfound' };
        }
      })
    );
    // If no events found, try fallback relays
    if (allEvents.length === 0 && fallback.length > 0) {
      relayStatuses = { ...relayStatuses, ...Object.fromEntries(fallback.map((r: string) => [r, 'pending'])) };
      await Promise.all(
        fallback.map(async (relay: string) => {
          try {
            const relaySet = NDKRelaySetFromNDK.fromRelayUrls([relay], ndk);
            let eventSet = await ndk.fetchEvents(
              {
                kinds: [indexKind],
                limit: 16,
                until: before,
              },
              {
                groupable: false,
                skipVerification: false,
                skipValidation: false,
              },
              relaySet
            ).withTimeout(2500);
            eventSet = filterValidIndexEvents(eventSet);
            const eventArray = filterEventsBySearch(Array.from(eventSet));
            fetchedCount += eventArray.length; // Count new events
            if (eventArray.length > 0) {
              allEvents = allEvents.concat(eventArray);
              relayStatuses = { ...relayStatuses, [relay]: 'found' };
            } else {
              relayStatuses = { ...relayStatuses, [relay]: 'notfound' };
            }
          } catch {
            relayStatuses = { ...relayStatuses, [relay]: 'notfound' };
          }
        })
      );
    }
    // Deduplicate and sort
    const eventMap = new Map([...eventsInView, ...allEvents].map(event => [event.tagAddress(), event]));
    const uniqueEvents = Array.from(eventMap.values());
    uniqueEvents.sort((a, b) => b.created_at! - a.created_at!);
    eventsInView = uniqueEvents;
    // Set endOfFeed if fewer than limit events were fetched
    if ((before !== undefined && fetchedCount < 30 && fallback.length === 0) ||
        (before !== undefined && fetchedCount < 16 && fallback.length > 0)) {
      endOfFeed = true;
    } else {
      endOfFeed = false;
    }
    loading = false;
    console.debug('Relay statuses:', relayStatuses);
  }

  const getSkeletonIds = (): string[] => {
    const skeletonHeight = 124; // The height of the skeleton component in pixels.
    const skeletonCount = Math.floor(window.innerHeight / skeletonHeight) - 2;
    const skeletonIds = [];
    for (let i = 0; i < skeletonCount; i++) {
      skeletonIds.push(`skeleton-${i}`);
    }
    return skeletonIds;
  }

  async function loadMorePublications() {
    loadingMore = true;
    await getEvents(cutoffTimestamp);
    loadingMore = false;
  }

  onMount(async () => {
    await getEvents();
  });
</script>

<div class='leather'>
  <div class='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
    {#if loading && eventsInView.length === 0}
      {#each getSkeletonIds() as id}
        <Skeleton divClass='skeleton-leather w-full' size='lg' />
      {/each}
    {:else if eventsInView.length > 0}
      {#each eventsInView as event}
        <ArticleHeader {event} />
      {/each}
    {:else}
      <div class='col-span-full'>
        <p class='text-center'>No publications found.</p>
      </div>
    {/if}
  </div>
  {#if !loadingMore && !endOfFeed}
    <div class='flex justify-center mt-4 mb-8'>
      <Button outline class="w-full max-w-md" onclick={async () => {
        await loadMorePublications();
      }}>
        Show more publications
      </Button>
    </div>
  {:else if loadingMore}
    <div class='flex justify-center mt-4 mb-8'>
      <Button outline disabled class="w-full max-w-md">
        <Spinner class='mr-3 text-gray-300' size='4' />
        Loading...
      </Button>
    </div>
  {:else}
    <div class='flex justify-center mt-4 mb-8'>
      <P class='text-sm text-gray-600'>You've reached the end of the feed.</P>
    </div>
  {/if}
</div>
