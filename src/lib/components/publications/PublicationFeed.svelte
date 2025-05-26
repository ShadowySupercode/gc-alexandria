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
    console.debug('[PublicationFeed] Search query changed:', query);
    if (query.trim()) {
      console.debug('[PublicationFeed] Clearing events and searching with query:', query);
      eventsInView = [];
      await getEvents(undefined, query, true);
    } else {
      console.debug('[PublicationFeed] Clearing events and resetting search');
      eventsInView = [];
      await getEvents(undefined, '', true);
    }
  }, 300);

  $effect(() => {
    console.debug('[PublicationFeed] Search query effect triggered:', searchQuery);
    debouncedSearch(searchQuery);
  });

  async function getEvents(before: number | undefined = undefined, search: string = '', reset: boolean = false) {
    loading = true;
    const ndk = $ndkInstance;
    const primaryRelays: string[] = relays;
    const fallback: string[] = fallbackRelays.filter((r: string) => !primaryRelays.includes(r));
    relayStatuses = Object.fromEntries(primaryRelays.map((r: string) => [r, 'pending']));
    let allEvents: NDKEvent[] = [];
    let fetchedCount = 0; // Track number of new events

    console.debug('[getEvents] Called with before:', before, 'search:', search);

    // Function to filter events based on search query
    const filterEventsBySearch = (events: NDKEvent[]) => {
      if (!search) return events;
      const query = search.toLowerCase();
      console.debug('[PublicationFeed] Filtering events with query:', query, 'Total events before filter:', events.length);

      // Check if the query is a NIP-05 address
      const isNip05Query = /^[a-z0-9._-]+@[a-z0-9.-]+$/i.test(query);
      console.debug('[PublicationFeed] Is NIP-05 query:', isNip05Query);

      const filtered = events.filter(event => {
        const title = getMatchingTags(event, 'title')[0]?.[1]?.toLowerCase() ?? '';
        const authorName = getMatchingTags(event, 'author')[0]?.[1]?.toLowerCase() ?? '';
        const authorPubkey = event.pubkey.toLowerCase();
        const nip05 = getMatchingTags(event, 'nip05')[0]?.[1]?.toLowerCase() ?? '';

        // For NIP-05 queries, only match against NIP-05 tags
        if (isNip05Query) {
          const matches = nip05 === query;
          if (matches) {
            console.debug('[PublicationFeed] Event matches NIP-05 search:', {
              id: event.id,
              nip05,
              authorPubkey
            });
          }
          return matches;
        }

        // For regular queries, match against all fields
        const matches = (
          title.includes(query) ||
          authorName.includes(query) ||
          authorPubkey.includes(query) ||
          nip05.includes(query)
        );
        if (matches) {
          console.debug('[PublicationFeed] Event matches search:', {
            id: event.id,
            title,
            authorName,
            authorPubkey,
            nip05
          });
        }
        return matches;
      });
      console.debug('[PublicationFeed] Events after filtering:', filtered.length);
      return filtered;
    };

    // First, try primary relays
    let foundEventsInPrimary = false;
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
            foundEventsInPrimary = true;
          } else {
            relayStatuses = { ...relayStatuses, [relay]: 'notfound' };
          }
          console.debug(`[getEvents] Fetched ${eventArray.length} events from relay: ${relay} (search: "${search}")`);
        } catch (err) {
          console.error(`Error fetching from primary relay ${relay}:`, err);
          relayStatuses = { ...relayStatuses, [relay]: 'notfound' };
        }
      })
    );

    // Only try fallback relays if no events were found in primary relays
    if (!foundEventsInPrimary && fallback.length > 0) {
      console.debug('[getEvents] No events found in primary relays, trying fallback relays');
      relayStatuses = { ...relayStatuses, ...Object.fromEntries(fallback.map((r: string) => [r, 'pending'])) };
      await Promise.all(
        fallback.map(async (relay: string) => {
          try {
            const relaySet = NDKRelaySetFromNDK.fromRelayUrls([relay], ndk);
            let eventSet = await ndk.fetchEvents(
              {
                kinds: [indexKind],
                limit: 18,
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
            console.debug(`[getEvents] Fetched ${eventArray.length} events from relay: ${relay} (search: "${search}")`);
          } catch (err) {
            console.error(`Error fetching from fallback relay ${relay}:`, err);
            relayStatuses = { ...relayStatuses, [relay]: 'notfound' };
          }
        })
      );
    }
    // Deduplicate and sort
    const eventMap = reset
      ? new Map(allEvents.map(event => [event.tagAddress(), event]))
      : new Map([...eventsInView, ...allEvents].map(event => [event.tagAddress(), event]));
    const uniqueEvents = Array.from(eventMap.values());
    uniqueEvents.sort((a, b) => b.created_at! - a.created_at!);
    eventsInView = uniqueEvents;
    const pageSize = fallback.length > 0 ? 18 : 30;
    if (fetchedCount < pageSize) {
      endOfFeed = true;
    } else {
      endOfFeed = false;
    }
    console.debug(`[getEvents] Total unique events after deduplication: ${uniqueEvents.length}`);
    console.debug(`[getEvents] endOfFeed set to: ${endOfFeed} (fetchedCount: ${fetchedCount}, pageSize: ${pageSize})`);
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
    await getEvents(cutoffTimestamp, searchQuery, false);
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
