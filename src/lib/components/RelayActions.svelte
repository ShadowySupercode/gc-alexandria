<script lang="ts">
  import { Button } from "flowbite-svelte";
  import { get } from "svelte/store";
  import type { NostrEvent, NostrUnsignedEvent } from '$lib/types/nostr';
  import RelayDisplay from "./RelayDisplay.svelte";
  import { selectedRelayGroup } from '$lib/utils/relayGroupUtils';
  import { getNostrClient } from '$lib/nostr/client';
  import { getEventHash } from '$lib/utils/eventUtils';
  import { fetchEventFromRelays, publishToRelays } from '$lib/utils/relayUtils'

  const { event } = $props<{
    event: NostrEvent;
  }>();

  // Define component state with proper typing
  let foundRelays = $state<string[]>([]);
  let broadcasting = $state(false);
  let broadcastSuccess = $state(false);
  let broadcastError = $state<string | null>(null);

  // Get the Nostr client
  let client = $derived.by(() => getNostrClient(get(selectedRelayGroup).outbox));

  // Helper to validate relay URLs (basic check)
  function isValidRelay(relay: string): boolean {
    return typeof relay === 'string' && relay.trim().length > 0 && relay.startsWith('ws');
  }

  // Use only selected relay group for inbox and outbox
  let searchRelays = $derived.by(() => {
    return ($selectedRelayGroup.inbox ?? []).filter(isValidRelay);
  });
  let publishRelays = $derived.by(() => {
    return ($selectedRelayGroup.outbox ?? []).filter(isValidRelay);
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
      if (publishRelays.length === 0) {
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

      // Publish to all outbox relays using utility
      await publishToRelays(publishedEvent, publishRelays);
      broadcastSuccess = true;
    } catch (err) {
      console.error('Error broadcasting event:', err);
      broadcastError = err instanceof Error ? err.message : 'Failed to broadcast event';
    } finally {
      broadcasting = false;
    }
  }

  $effect(() => {
    if (!event?.id || !searchRelays.length) {
      foundRelays = [];
      return;
    }
    console.log('[RelayActions] Searching for event', event.id, 'on relays:', searchRelays);
    const start = performance.now();
    (async () => {
      const results = await fetchEventFromRelays({ ids: [event.id] }, searchRelays, 4000);
      foundRelays = results.map(r => r.relay);
      const runtime = performance.now() - start;
      console.log('[RelayActions] Search complete. Found on:', foundRelays, `(${runtime.toFixed(1)}ms)`);
    })();
  });
</script>

<div class="mt-4 flex flex-wrap gap-2">
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
      {#each publishRelays as relay}
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
