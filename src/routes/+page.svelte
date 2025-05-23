<script lang='ts'>
  import { FeedType, feedTypeStorageKey, standardRelays, fallbackRelays } from '$lib/consts';
  import { Alert, Button, Dropdown, Radio, Input } from "flowbite-svelte";
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

  let searchQuery = $state('');
</script>

<Alert rounded={false} id="alert-experimental" class='border-t-4 border-primary-500 text-gray-900 dark:text-gray-100 dark:border-primary-500 flex justify-left mb-2'>
  <HammerSolid class='mr-2 h-5 w-5 text-primary-500 dark:text-primary-500' />
  <span class='font-medium'>
      Pardon our dust!  The publication view is currently using an experimental loader, and may be unstable.
    </span>
</Alert>

<main class='leather flex flex-col flex-grow-0 space-y-4 p-4'>
  {#if !$ndkSignedIn}
    <PublicationFeed userRelays={standardRelays} fallbackRelays={fallbackRelays} searchQuery={searchQuery} loggedIn={false} />
  {:else}
    {#if $feedType === FeedType.StandardRelays}
      <PublicationFeed userRelays={standardRelays} fallbackRelays={fallbackRelays} searchQuery={searchQuery} loggedIn={true} />
    {:else if $feedType === FeedType.UserRelays}
      <PublicationFeed userRelays={$inboxRelays} fallbackRelays={fallbackRelays} searchQuery={searchQuery} loggedIn={true} />
    {/if}
  {/if}
</main>
