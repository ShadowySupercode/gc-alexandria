<script lang='ts'>
  import { indexKind } from '$lib/consts';
  import { ndkInstance } from '$lib/ndk';
  import { filterValidIndexEvents } from '$lib/utils';
  import { NDKRelaySet, type NDKEvent } from '@nostr-dev-kit/ndk';
  import { Button, P, Skeleton, Spinner } from 'flowbite-svelte';
  import ArticleHeader from './PublicationHeader.svelte';
  import { onMount } from 'svelte';

  let { relays, fallbackRelays } = $props<{ relays: string[], fallbackRelays: string[] }>();

  let eventsInView: NDKEvent[] = $state([]);
  let loadingMore: boolean = $state(false);
  let endOfFeed: boolean = $state(false);
  let relayStatuses = $state<Record<string, 'pending' | 'found' | 'notfound'>>({});
  let loading: boolean = $state(true);

  let cutoffTimestamp: number = $derived(
    eventsInView?.at(eventsInView.length - 1)?.created_at ?? new Date().getTime()
  );

  async function getEvents(before: number | undefined = undefined) {
    loading = true;
    const ndk = $ndkInstance;
    const primaryRelays: string[] = relays;
    const fallback: string[] = fallbackRelays.filter((r: string) => !primaryRelays.includes(r));
    relayStatuses = Object.fromEntries(primaryRelays.map((r: string) => [r, 'pending']));
    let allEvents: NDKEvent[] = [];
    // First, try primary relays
    await Promise.all(
      primaryRelays.map(async (relay: string) => {
        try {
          const relaySet = NDKRelaySet.fromRelayUrls([relay], ndk);
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
          const eventArray = Array.from(eventSet);
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
            const relaySet = NDKRelaySet.fromRelayUrls([relay], ndk);
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
            const eventArray = Array.from(eventSet);
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
    endOfFeed = false; // Could add logic to detect end
    loading = false;
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

<div class='leather flex flex-col space-y-4'>
  <div class="flex flex-wrap gap-2">
    {#each Object.entries(relayStatuses) as [relay, status]}
      <span class="text-xs font-mono px-2 py-1 rounded border" class:bg-green-100={status==='found'} class:bg-red-100={status==='notfound'} class:bg-yellow-100={status==='pending'}>{relay}: {status}</span>
    {/each}
  </div>
  {#if loading && eventsInView.length === 0}
    {#each getSkeletonIds() as id}
      <Skeleton divClass='skeleton-leather w-full' size='lg' />
    {/each}
  {:else if eventsInView.length > 0}
    {#each eventsInView as event}
      <ArticleHeader {event} />
    {/each}
  {:else}
    <p class='text-center'>No publications found.</p>
  {/if}
  {#if !loadingMore && !endOfFeed}
    <div class='flex justify-center mt-4 mb-8'>
      <Button outline class="w-full" onclick={async () => {
        await loadMorePublications();
      }}>
        Show more publications
      </Button>
    </div>
  {:else if loadingMore}
    <div class='flex justify-center mt-4 mb-8'>
      <Button outline disabled class="w-full">
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
