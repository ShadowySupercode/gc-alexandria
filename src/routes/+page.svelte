<script lang='ts'>
  import ArticleHeader from '$lib/components/ArticleHeader.svelte';
  import { FeedType, indexKind, standardRelays } from '$lib/consts';
  import { filterValidIndexEvents } from '$lib/utils';
  import { NDKEvent, NDKRelaySet, type NDKUser } from '@nostr-dev-kit/ndk';
  import { Button, Dropdown, P, Radio, Skeleton, Spinner } from 'flowbite-svelte';
  import { ChevronDownOutline } from 'flowbite-svelte-icons';
  import { inboxRelays, ndkInstance, ndkSignedIn } from '$lib/ndk';

  let user: NDKUser | null | undefined = $state($ndkInstance.activeUser);
  let feedType: FeedType = $state(FeedType.StandardRelays);
  let eventsInView: NDKEvent[] = $state([]);
  let loadingMore: boolean = $state(false);
  let endOfFeed: boolean = $state(false);

  let cutoffTimestamp: number = $derived(
    eventsInView?.at(eventsInView.length - 1)?.created_at ?? new Date().getTime()
  );

  async function getEvents(
    before: number | undefined = undefined,
    relays: string[] = standardRelays
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

  // TODO: Use the user's inbox relays.
  async function getEventsFromUserRelays(before: number = cutoffTimestamp): Promise<void> {
    await getEvents(before, $inboxRelays);
  }

  // TODO: Remove feed type switching.  We will use relays only for now.
  const getFeedTypeFriendlyName = (feedType: FeedType): string => {
    switch (feedType) {
    case FeedType.StandardRelays:
      return `Alexandria's Relays`;
    case FeedType.UserRelays:
      return `Your Relays`;
    default:
      return '';
    }
  };

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
    if (user != null) {
      await getEventsFromUserRelays(cutoffTimestamp);
    } else {
      await getEvents(cutoffTimestamp);
    }
    loadingMore = false;
  }
</script>

<div class='leather flex flex-col flex-grow-0 space-y-4 overflow-y-auto w-max p-2'>
  {#if !$ndkSignedIn}
    {#await getEvents()}
      {#each getSkeletonIds() as id}
        <Skeleton size='lg' />
      {/each}
    {:then}
      {#if eventsInView.length > 0}
        {#each eventsInView as event}
          <ArticleHeader {event} />
        {/each}
      {:else}
        <p class='text-center'>No articles found.</p>
      {/if}
    {/await}
  {:else}
    <div class='leather w-full flex justify-end'>
      <Button>
        {`Showing articles from: ${getFeedTypeFriendlyName(feedType)}`}<ChevronDownOutline class='w-6 h-6' />
      </Button>
      <Dropdown class='w-fit p-2 space-y-2 text-sm'>
        <li>
          <Radio name='relays' bind:group={feedType} value={FeedType.StandardRelays}>Alexandria's Relays</Radio>
        </li>
        <li>
          <Radio name='follows' bind:group={feedType} value={FeedType.UserRelays}>Your Relays</Radio>
        </li>
      </Dropdown>
    </div>
    {#if feedType === FeedType.StandardRelays}
      {#await getEvents()}
        {#each getSkeletonIds() as id}
          <Skeleton size='lg' />
        {/each}
      {:then}
        {#if eventsInView.length > 0}
          {#each eventsInView as event}
            <ArticleHeader {event} />
          {/each}
        {:else}
          <p class='text-center'>No articles found.</p>
        {/if}
      {/await}
    {:else if feedType === FeedType.UserRelays}
      {#await getEventsFromUserRelays()}
        {#each getSkeletonIds() as id}
          <Skeleton size='lg' />
        {/each}
      {:then}
        {#if eventsInView.length > 0}
          {#each eventsInView as event}
            <ArticleHeader {event} />
          {/each}
        {:else}
          <p class='text-center'>No articles found.</p>
        {/if}
      {/await}
    {/if}
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
