<script lang='ts'>
  import { FeedType, feedTypeStorageKey, standardRelays } from '$lib/consts';
  import { Alert, Button, Dropdown, Radio } from "flowbite-svelte";
  import { ChevronDownOutline, HammerSolid } from "flowbite-svelte-icons";
  import { inboxRelays, ndkSignedIn } from '$lib/ndk';
  import PublicationFeed from '$lib/components/PublicationFeed.svelte';
  import { feedType } from '$lib/stores';

  $effect(() => {
    localStorage.setItem(feedTypeStorageKey, $feedType);
  });

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
</script>

<Alert rounded={false} id="alert-experimental" class='border-t-4 border-primary-500 text-gray-900 dark:text-gray-100 dark:border-primary-500 flex justify-left mb-2'>
  <HammerSolid class='mr-2 h-5 w-5 text-primary-500 dark:text-primary-500' />
  <span class='font-medium'>
      Pardon our dust!  The publication view is currently using an experimental loader, and may be unstable.
    </span>
</Alert>

<main class='leather flex flex-col flex-grow-0 space-y-4 p-4'>
  {#if !$ndkSignedIn}
    <PublicationFeed relays={standardRelays} />
  {:else}
    <div class='leather w-full flex justify-end'>
      <Button>
        {`Showing publications from: ${getFeedTypeFriendlyName($feedType)}`}<ChevronDownOutline class='w-6 h-6' />
      </Button>
      <Dropdown class='w-fit p-2 space-y-2 text-sm'>
        <li>
          <Radio name='relays' bind:group={$feedType} value={FeedType.StandardRelays}>Alexandria's Relays</Radio>
        </li>
        <li>
          <Radio name='follows' bind:group={$feedType} value={FeedType.UserRelays}>Your Relays</Radio>
        </li>
      </Dropdown>
    </div>
    {#if $feedType === FeedType.StandardRelays}
      <PublicationFeed relays={standardRelays} />
    {:else if $feedType === FeedType.UserRelays}
      <PublicationFeed relays={$inboxRelays} />
    {/if}
  {/if}
</main>
