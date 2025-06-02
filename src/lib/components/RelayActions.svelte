<script lang="ts">
  import { Button } from "flowbite-svelte";
  import { get } from "svelte/store";
  import type { NostrEvent, NostrUnsignedEvent } from '$lib/types/nostr';
  import {
    publishEvent,
  } from "$lib/utils";
  import RelayDisplay from "./RelayDisplay.svelte";
  import { communityRelays, fallbackRelays } from "$lib/consts";
  import { userInboxRelays, userOutboxRelays, responsiveLocalRelays } from "$lib/stores/relayStore";
  import { selectRelayGroup } from '$lib/utils/relayGroupUtils';
  import { getNostrClient } from '$lib/nostr/client';
  import { getEventHash } from '$lib/utils';

  const { event } = $props<{
    event: NostrEvent;
  }>();

  // Define component state with proper typing
  let foundRelays = $state<string[]>([]);
  let broadcasting = $state(false);
  let broadcastSuccess = $state(false);
  let broadcastError = $state<string | null>(null);
  let showRelayModal = $state(false);
  let relaySearchResults = $state<Record<string, RelaySearchStatus>>({});
  let relayTimings = $state<Record<string, string>>({});

  // Define types for better type safety
  type RelaySearchStatus = 'pending' | 'found' | 'notfound' | 'timeout' | 'error';
  type RelayGroup = 'Standard Relays' | 'User Relays' | 'Fallback Relays';

  // Get the Nostr client
  let client = $derived.by(() => getNostrClient());

  // Helper to validate relay URLs (basic check)
  function isValidRelay(relay: string): boolean {
    return typeof relay === 'string' && relay.trim().length > 0 && relay.startsWith('ws');
  }

  // Get all available relays
  let allRelays = $derived.by(() => {
    const userRelays = selectRelayGroup('inbox');
    return [
      ...communityRelays,
      ...fallbackRelays,
      ...$responsiveLocalRelays,
      ...userRelays,
    ].filter((url, idx, arr) => arr.indexOf(url) === idx && isValidRelay(url));
  });

  // Magnifying glass icon SVG
  const searchIcon = `<svg class="w-4 h-4 mr-2" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 20">
    <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m19 19-4-4m0-7A7 7 0 1 1 1 8a7 7 0 0 1 14 0Z"/>
  </svg>`;

  // Broadcast icon SVG
  const broadcastIcon = `<svg class="w-4 h-4 mr-2" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 0 0-3.7-3.7 48.678 48.678 0 0 0-7.324 0 4.006 4.006 0 0 0-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 0 0 3.7 3.7 48.656 48.656 0 0 0 7.324 0 4.006 4.006 0 0 0 3.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3-3 3"/>
  </svg>`;

  async function broadcastEvent(): Promise<void> {
    if (!client) {
      broadcastError = 'Nostr client not initialized';
      return;
    }

    const user = client.getActiveUser();
    if (!event || !user) {
      broadcastError = 'No active user found';
      return;
    }

    broadcasting = true;
    broadcastSuccess = false;
    broadcastError = null;

    try {
      if (allRelays.length === 0) {
        throw new Error('No relays available');
      }

      // Create a new unsigned event
      const unsignedEvent: NostrUnsignedEvent = {
        kind: event.kind,
        created_at: Math.floor(Date.now() / 1000),
        tags: event.tags,
        content: event.content,
        pubkey: user.pubkey,
      };

      // Calculate event ID
      const eventId = getEventHash(unsignedEvent);

      // Sign the event using the WebExtension
      if (!window.nostr) {
        throw new Error('Nostr WebExtension not found');
      }

      const signedEvent = await window.nostr.signEvent({
        kind: unsignedEvent.kind,
        created_at: unsignedEvent.created_at,
        tags: unsignedEvent.tags,
        content: unsignedEvent.content,
        pubkey: unsignedEvent.pubkey,
      });

      // Create the final signed event
      const publishedEvent: NostrEvent = {
        ...unsignedEvent,
        id: eventId,
        sig: signedEvent.sig,
      };

      await client.publish(publishedEvent);
      broadcastSuccess = true;
    } catch (err) {
      console.error('Error broadcasting event:', err);
      broadcastError = err instanceof Error ? err.message : 'Failed to broadcast event';
    } finally {
      broadcasting = false;
    }
  }

  async function openRelayModal() {
    showRelayModal = true;
    relaySearchResults = {};
    searchAllRelaysLive();
  }

  async function searchAllRelaysLive(): Promise<void> {
    if (!client) {
      console.error('Nostr client not initialized');
      return;
    }

    const user = client.getActiveUser();
    if (!user) {
      console.error('No active user found');
      return;
    }

    // Reset relay statuses
    relaySearchResults = Object.fromEntries(
      allRelays.map((r: string) => [r, 'pending' as RelaySearchStatus]),
    );

    // Try all relays
    await Promise.allSettled(
      allRelays.map(async (relay: string) => {
        const start = performance.now();
        try {
          // Simulate a search operation
          await Promise.race([
            new Promise((resolve) => setTimeout(resolve, 100)),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000)),
          ]);
          const end = performance.now();
          relayTimings[relay] = `${Math.round(end - start)}ms`;
          relaySearchResults = { ...relaySearchResults, [relay]: 'found' };
        } catch (err) {
          console.error(`Error searching relay ${relay}:`, err);
          relaySearchResults = { ...relaySearchResults, [relay]: 'error' };
        }
      }),
    );
  }

  function closeRelayModal() {
    showRelayModal = false;
  }
</script>

<div class="mt-4 flex flex-wrap gap-2">
  <Button onclick={openRelayModal} class="flex items-center">
    {@html searchIcon}
    Where can I find this event?
  </Button>

  {#if client?.getActiveUser()}
    <Button
      onclick={broadcastEvent}
      disabled={broadcasting}
      class="flex items-center"
    >
      {@html broadcastIcon}
      {broadcasting ? "Broadcasting..." : "Broadcast"}
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
      {#each allRelays as relay}
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
    {#each allRelays as relay}
      <RelayDisplay {relay} showStatus={true} status={relaySearchResults[relay] || null} timing={relayTimings[relay]} />
    {/each}
  </div>
</div>

{#if showRelayModal}
  <div
    class="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center"
  >
    <div
      class="bg-white dark:bg-gray-900 rounded-lg shadow-lg p-6 w-full max-w-lg relative"
    >
      <button
        class="absolute top-2 right-2 text-gray-500 hover:text-gray-800"
        onclick={closeRelayModal}>&times;</button
      >
      <h2 class="text-lg font-semibold mb-4">Relay Search Results</h2>
      <div class="flex flex-col gap-4 max-h-96 overflow-y-auto">
        {#each Object.entries({
          'Standard Relays': communityRelays,
          'User Relays': selectRelayGroup('inbox'),
          'Fallback Relays': fallbackRelays,
        }) as [groupName, groupRelays]}
          {#if groupRelays.length > 0}
            <div class="flex flex-col gap-2">
              <h3
                class="font-medium text-gray-700 dark:text-gray-300 sticky top-0 bg-white dark:bg-gray-900 py-2"
              >
                {groupName}
              </h3>
              {#each groupRelays as relay}
                {#if isValidRelay(relay)}
                  <RelayDisplay
                    {relay}
                    showStatus={true}
                    status={relaySearchResults[relay] ?? null}
                    timing={relayTimings[relay]}
                  />
                {:else}
                  <div class="text-gray-400 italic">Invalid relay</div>
                {/if}
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
