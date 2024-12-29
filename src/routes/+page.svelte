<script lang='ts'>
  import ArticleHeader from '$lib/components/ArticleHeader.svelte';
  import { FeedType, indexKind, standardRelays } from '$lib/consts';
  import { filterValidIndexEvents } from '$lib/utils';
  import NDK, { NDKEvent, NDKRelaySet, type NDKUser } from '@nostr-dev-kit/ndk';
  import { Button, Dropdown, Radio, Skeleton } from 'flowbite-svelte';
  import { ChevronDownOutline } from 'flowbite-svelte-icons';
  import type { PageData } from './$types';
  import { setContext } from 'svelte';

  let { data }: { data: PageData } = $props();
  let ndk: NDK = data.ndk;

  let user: NDKUser | null | undefined = $state(ndk.activeUser);
  let readRelays: string[] | null | undefined = $state(user?.relayUrls);
  let userFollows: Set<NDKUser> | null | undefined = $state(null);
  let feedType: FeedType = $state(FeedType.Relays);

  $effect(() => {
    if (user) {
      user.follows().then(follows => userFollows = follows);
    }
  });

  const getEvents = (): Promise<Set<NDKEvent>> =>
    // @ts-ignore
    ndk.fetchEvents(
      { kinds: [indexKind] },
      { 
        groupable: true,
        skipVerification: false,
        skipValidation: false
      },
      NDKRelaySet.fromRelayUrls(standardRelays, ndk)
    ).then(filterValidIndexEvents);

  const getEventsFromUserRelays = (userRelays: string[]): Promise<Set<NDKEvent>> => {
    return ndk
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

  const getEventsFromUserFollows = (follows: Set<NDKUser>, userRelays?: string[]): Promise<Set<NDKEvent>> => {
    return ndk
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
        {#if events.size > 0}
          {#each Array.from(events) as event}
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
</div>
