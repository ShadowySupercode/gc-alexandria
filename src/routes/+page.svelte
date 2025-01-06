<script lang='ts'>
  import ArticleHeader from '$lib/components/ArticleHeader.svelte';
  import { FeedType, indexKind, standardRelays } from '$lib/consts';
  import { filterValidIndexEvents } from '$lib/utils';
  import { NDKEvent, NDKRelaySet, type NDKUser } from '@nostr-dev-kit/ndk';
  import { Button, Dropdown, Radio, Skeleton } from 'flowbite-svelte';
  import { ChevronDownOutline } from 'flowbite-svelte-icons';
  import { ndkInstance } from '$lib/ndk';

  let user: NDKUser | null | undefined = $state($ndkInstance.activeUser);
  let readRelays: string[] | null | undefined = $state(user?.relayUrls);
  let userFollows: Set<NDKUser> | null | undefined = $state(null);
  let feedType: FeedType = $state(FeedType.Relays);
  let eventsInView: NDKEvent[] = $state([]);
  let cutoffTimestamp: number = $state(new Date().getTime());

  $effect(() => {
    if (user) {
      user.follows().then(follows => userFollows = follows);
    }
  });

  const getEvents = async (): Promise<NDKEvent[]> => 
    $ndkInstance
      .fetchEvents(
        { 
          kinds: [indexKind],
          limit: 16,
          until: cutoffTimestamp
        },
        { 
          groupable: true,
          skipVerification: false,
          skipValidation: false
        },
        NDKRelaySet.fromRelayUrls(user?.relayUrls ?? standardRelays, $ndkInstance)
      )
      .then(filterValidIndexEvents)
      .then(filteredEvents => Array.from(filteredEvents).sort((a, b) => b.created_at! - a.created_at!))
      .then(sortedEvents => {
        cutoffTimestamp = sortedEvents[sortedEvents.length - 1].created_at!;
        eventsInView = [...eventsInView, ...sortedEvents];
        return sortedEvents;
      });

  // TODO: Use the user's inbox relays.
  const getEventsFromUserRelays = (userRelays: string[]): Promise<Set<NDKEvent>> => {
    return $ndkInstance
      .fetchEvents(
        // @ts-ignore
        { kinds: [indexKind] },
        { 
          closeOnEose: true,
          groupable: true,
          skipVerification: false,
          skipValidation: false,
        },
      )
      .then(filterValidIndexEvents);
  }

  // TODO: Remove this function.
  const getEventsFromUserFollows = (follows: Set<NDKUser>, userRelays?: string[]): Promise<Set<NDKEvent>> => {
    return $ndkInstance
      .fetchEvents(
        { 
          authors: Array.from(follows ?? []).map(user => user.pubkey),
          // @ts-ignore
          kinds: [indexKind]
        },
        { 
          groupable: true,
          skipVerification: false,
          skipValidation: false
        },
      )
      .then(filterValidIndexEvents);
  }

  // TODO: Remove feed type switching.  We will use relays only for now.
  const getFeedTypeFriendlyName = (feedType: FeedType): string => {
    switch (feedType) {
    case FeedType.Relays:
      return 'Relays';
    case FeedType.Follows:
      return 'Follows';
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
</script>

<div class='leather flex flex-col flex-grow-0 space-y-4 overflow-y-auto w-max p-2'>
  {#key user}
    {#if user == null || readRelays == null}
      {#await getEvents()}
        {#each getSkeletonIds() as id}
          <Skeleton size='lg' />
        {/each}
      {:then events}
        {#if events.length > 0}
          {#each events as event}
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
            <Radio name='relays' bind:group={feedType} value={FeedType.Relays}>Relays</Radio>
          </li>
          <li>
            <Radio name='follows' bind:group={feedType} value={FeedType.Follows}>Follows</Radio>
          </li>
        </Dropdown>
      </div>
      {#if feedType === FeedType.Relays && readRelays != null}
        {#await getEventsFromUserRelays(readRelays)}
          {#each getSkeletonIds() as id}
            <Skeleton size='lg' />
          {/each}
        {:then events}
          {#if events.size > 0}
            {#each Array.from(events) as event}
              <ArticleHeader {event} />
            {/each}
          {:else}
            <p class='text-center'>No articles found.</p>
          {/if}
        {/await}
      {:else if feedType === FeedType.Follows && userFollows != null}
        {#await getEventsFromUserFollows(userFollows, readRelays)}
          {#each getSkeletonIds() as id}
            <Skeleton size='lg' />
          {/each}
        {:then events}
          {#if events.size > 0}
            {#each Array.from(events) as event}
              <ArticleHeader {event} />
            {/each}
          {:else}
            <p class='text-center'>No articles found.</p>
          {/if}
        {/await}
      {/if}
    {/if}
  {/key}
  <!-- TODO: Add a "show more" button. -->
</div>
