<script lang='ts'>
  import { Alert } from 'flowbite-svelte';
  import { HammerSolid } from 'flowbite-svelte-icons';
  import PublicationFeed from '$lib/components/PublicationFeed.svelte';
  import { relayGroup } from '$lib/stores/relayGroup';
  import { setRelayGroup, selectRelayGroup } from '$lib/utils/relayGroupUtils';
  import { ndkSignedIn } from '$lib/ndk';
  import { fallbackRelays } from '$lib/consts';

  let searchQuery = $state('');

  function handleRelayGroupChange(group: 'community' | 'user') {
    setRelayGroup(group);
  }
</script>

<Alert rounded={false} id="alert-experimental" class='border-t-4 border-primary-500 text-gray-900 dark:text-gray-100 dark:border-primary-500 flex justify-left mb-2'>
  <HammerSolid class='mr-2 h-5 w-5 text-primary-500 dark:text-primary-500' />
  <span class='font-medium'>
      Pardon our dust!  The publication view is currently using an experimental loader, and may be unstable.
    </span>
</Alert>

<main class='leather flex flex-col flex-grow-0 space-y-4 p-4'>
  <!-- Relay Group Selector -->
  <div class="mb-4 flex gap-4 items-center" role="group" aria-labelledby="relay-group-label">
    <span id="relay-group-label" class="font-medium text-gray-900 dark:text-gray-100">
      Relay Group:
    </span>
    <button
      class="px-4 py-2 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-brown-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brown-400"
      onclick={() => handleRelayGroupChange('community')}
      aria-pressed={$relayGroup === 'community'}
    >
      Community Relays
    </button>
    <button
      class="px-4 py-2 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-brown-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brown-400"
      onclick={() => handleRelayGroupChange('user')}
      aria-pressed={$relayGroup === 'user'}
    >
      Your Relays
    </button>
  </div>

  <!-- Search Bar -->
  <div class="mb-4 flex gap-2 items-center">
    <input
      type="text"
      class="flex-1 px-4 py-2 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-brown-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brown-400"
      placeholder="Search publications by title or author..."
      bind:value={searchQuery}
    />
    <button
      class="px-4 py-2 rounded bg-brown-100 dark:bg-brown-900 text-brown-900 dark:text-brown-100 border border-brown-300 dark:border-brown-700 hover:bg-brown-200 dark:hover:bg-brown-800 focus:ring-2 focus:ring-brown-400"
      onclick={() => searchQuery = ''}
    >
      Clear
    </button>
  </div>

  <PublicationFeed
    userRelays={selectRelayGroup()}
    fallbackRelays={fallbackRelays}
    {searchQuery}
    loggedIn={$ndkSignedIn}
  />
</main>
