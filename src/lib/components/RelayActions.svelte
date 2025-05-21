<script lang="ts">
  import { Button } from "flowbite-svelte";
  import { ndkInstance } from "$lib/ndk";
  import { get } from 'svelte/store';
  import type { NDKEvent } from '$lib/utils/nostrUtils';
  import { createRelaySetFromUrls, createNDKEvent } from '$lib/utils/nostrUtils';
  import RelayDisplay, { getConnectedRelays, getEventRelays } from './RelayDisplay.svelte';
  import { standardRelays, fallbackRelays } from "$lib/consts";

  const { event } = $props<{
    event: NDKEvent;
  }>();

  let searchingRelays = $state(false);
  let foundRelays = $state<string[]>([]);
  let broadcasting = $state(false);
  let broadcastSuccess = $state(false);
  let broadcastError = $state<string | null>(null);
  let showRelayModal = $state(false);
  let relaySearchResults = $state<Record<string, 'pending' | 'found' | 'notfound'>>({});
  let allRelays = $state<string[]>([]);

  // Magnifying glass icon SVG
  const searchIcon = `<svg class="w-4 h-4 mr-2" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 20">
    <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m19 19-4-4m0-7A7 7 0 1 1 1 8a7 7 0 0 1 14 0Z"/>
  </svg>`;

  // Broadcast icon SVG
  const broadcastIcon = `<svg class="w-4 h-4 mr-2" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 0 0-3.7-3.7 48.678 48.678 0 0 0-7.324 0 4.006 4.006 0 0 0-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 0 0 3.7 3.7 48.656 48.656 0 0 0 7.324 0 4.006 4.006 0 0 0 3.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3-3 3"/>
  </svg>`;

  async function broadcastEvent() {
    if (!event || !$ndkInstance?.activeUser) return;
    broadcasting = true;
    broadcastSuccess = false;
    broadcastError = null;

    try {
      const connectedRelays = getConnectedRelays();
      if (connectedRelays.length === 0) {
        throw new Error('No connected relays available');
      }

      // Create a new event with the same content
      const newEvent = createNDKEvent($ndkInstance, {
        ...event.rawEvent(),
        pubkey: $ndkInstance.activeUser.pubkey,
        created_at: Math.floor(Date.now() / 1000),
        sig: ''
      });

      // Publish to all relays
      await newEvent.publish();
      broadcastSuccess = true;
    } catch (err) {
      console.error('Error broadcasting event:', err);
      broadcastError = err instanceof Error ? err.message : 'Failed to broadcast event';
    } finally {
      broadcasting = false;
    }
  }

  function openRelayModal() {
    showRelayModal = true;
    relaySearchResults = {};
    searchAllRelaysLive();
  }

  async function searchAllRelaysLive() {
    if (!event) return;
    relaySearchResults = {};
    const ndk = get(ndkInstance);
    const userRelays = Array.from(ndk?.pool?.relays.values() || []).map(r => r.url);
    allRelays = [
      ...standardRelays,
      ...userRelays,
      ...fallbackRelays
    ].filter((url, idx, arr) => arr.indexOf(url) === idx);
    relaySearchResults = Object.fromEntries(allRelays.map((r: string) => [r, 'pending']));
    await Promise.all(
      allRelays.map(async (relay: string) => {
        try {
          const relaySet = createRelaySetFromUrls([relay], ndk);
          const found = await ndk.fetchEvent(
            { ids: [event?.id || ''] },
            undefined,
            relaySet
          ).withTimeout(3000);
          relaySearchResults = { ...relaySearchResults, [relay]: found ? 'found' : 'notfound' };
        } catch {
          relaySearchResults = { ...relaySearchResults, [relay]: 'notfound' };
        }
      })
    );
  }

  function closeRelayModal() {
    showRelayModal = false;
  }

</script>

<div class="mt-4 flex flex-wrap gap-2">
  <Button 
    on:click={openRelayModal} 
    class="flex items-center"
  >
    {@html searchIcon}
    Where can I find this event?
  </Button>

  {#if $ndkInstance?.activeUser}
    <Button 
      on:click={broadcastEvent} 
      disabled={broadcasting}
      class="flex items-center"
    >
      {@html broadcastIcon}
      {broadcasting ? 'Broadcasting...' : 'Broadcast'}
    </Button>
  {/if}
</div>

{#if foundRelays.length > 0}
  <div class="mt-2">
    <span class="font-semibold">Found on {foundRelays.length} relay(s):</span>
    <div class="flex flex-wrap gap-2 mt-1">
      {#each foundRelays as relay}
        <RelayDisplay {relay} />
      {/each}
    </div>
  </div>
{/if}

{#if broadcastSuccess}
  <div class="mt-2 p-2 bg-green-100 text-green-700 rounded">
    Event broadcast successfully to:
    <div class="flex flex-wrap gap-2 mt-1">
      {#each getConnectedRelays() as relay}
        <RelayDisplay {relay} />
      {/each}
    </div>
  </div>
{/if}

{#if broadcastError}
  <div class="mt-2 p-2 bg-red-100 text-red-700 rounded">
    {broadcastError}
  </div>
{/if}

<div class="mt-2">
  <span class="font-semibold">Found on:</span>
  <div class="flex flex-wrap gap-2 mt-1">
    {#each getEventRelays(event) as relay}
      <RelayDisplay {relay} />
    {/each}
  </div>
</div>

{#if showRelayModal}
  <div class="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center">
    <div class="bg-white dark:bg-gray-900 rounded-lg shadow-lg p-6 w-full max-w-lg relative">
      <button class="absolute top-2 right-2 text-gray-500 hover:text-gray-800" onclick={closeRelayModal}>&times;</button>
      <h2 class="text-lg font-semibold mb-4">Relay Search Results</h2>
      <div class="flex flex-col gap-4 max-h-96 overflow-y-auto">
        {#each Object.entries({
          'Standard Relays': standardRelays,
          'User Relays': Array.from($ndkInstance?.pool?.relays.values() || []).map(r => r.url),
          'Fallback Relays': fallbackRelays
        }) as [groupName, groupRelays]}
          {#if groupRelays.length > 0}
            <div class="flex flex-col gap-2">
              <h3 class="font-medium text-gray-700 dark:text-gray-300 sticky top-0 bg-white dark:bg-gray-900 py-2">
                {groupName}
              </h3>
              {#each groupRelays as relay}
                <RelayDisplay {relay} showStatus={true} status={relaySearchResults[relay] || null} />
              {/each}
            </div>
          {/if}
        {/each}
      </div>
      <div class="mt-4 flex justify-end">
        <Button onclick={closeRelayModal}>Close</Button>
      </div>
    </div>
  </div>
{/if} 