<script lang='ts'>
  import { indexKind } from '$lib/consts';
  import { ndkInstance } from '$lib/ndk';
  import { filterValidIndexEvents } from '$lib/utils';
  import { NDKRelaySet, type NDKEvent } from '@nostr-dev-kit/ndk';
  import { Button, P, Skeleton, Spinner } from 'flowbite-svelte';
  import ArticleHeader from './ArticleHeader.svelte';
  import { onMount } from 'svelte';

  let { relays } = $props<{ relays: string[] }>();

  let eventsInView: NDKEvent[] = $state([]);
  let loadingMore: boolean = $state(false);
  let endOfFeed: boolean = $state(false);

  let cutoffTimestamp: number = $derived(
    eventsInView?.at(eventsInView.length - 1)?.created_at ?? new Date().getTime()
  );

  async function getEvents(
    before: number | undefined = undefined,
  ): Promise<void> {
    let eventSet = await $ndkInstance.fetchEvents(
      { 
        kinds: [indexKind],
        limit: 16,
        until: before,
      },
      { 
        groupable: true,
        skipVerification: false,
        skipValidation: false
      },
      NDKRelaySet.fromRelayUrls(relays, $ndkInstance)
    );
    eventSet = filterValidIndexEvents(eventSet);
    
    let eventArray = Array.from(eventSet);
    eventArray?.sort((a, b) => b.created_at! - a.created_at!);

    if (!eventArray) {
      return;
    }

    endOfFeed = eventArray?.at(eventArray.length - 1)?.id === eventsInView?.at(eventsInView.length - 1)?.id;

    if (endOfFeed) {
      return;
    }

    const eventMap = new Map([...eventsInView, ...eventArray].map(event => [event.id, event]));
    const allEvents = Array.from(eventMap.values());
    const uniqueIds = new Set(allEvents.map(event => event.id));
    eventsInView = Array.from(uniqueIds)
      .map(id => eventMap.get(id))
      .filter(event => event != null) as NDKEvent[];
  }

  const getSkeletonIds = (): string[] => {
    const skeletonHeight = 124; // The height of the skeleton component in pixels.

    // Determine the number of skeletons to display based on the height of the screen.
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

<div class='leather flex flex-col flex-grow-0 space-y-4 overflow-y-auto w-max p-2'>
  {#if eventsInView.length === 0}
    {#each getSkeletonIds() as id}
      <Skeleton size='lg' />
    {/each}
  {:else if eventsInView.length > 0}
    {#each eventsInView as event}
      <ArticleHeader {event} />
    {/each}
  {:else}
    <p class='text-center'>No articles found.</p>
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
