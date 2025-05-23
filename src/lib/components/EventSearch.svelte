<script lang="ts">
  import { Input, Button } from "flowbite-svelte";
  import { ndkInstance } from "$lib/ndk";
  import { fetchEventWithFallback } from "$lib/utils/nostrUtils";
  import { nip19 } from '$lib/utils/nostrUtils';
  import { goto } from '$app/navigation';
  import type { NDKEvent } from '$lib/utils/nostrUtils';
  import RelayDisplay from './RelayDisplay.svelte';

  const { loading, error, searchValue, onEventFound, event } = $props<{
    loading: boolean;
    error: string | null;
    searchValue: string | null;
    onEventFound: (event: NDKEvent) => void;
    event: NDKEvent | null;
  }>();

  let searchQuery = $state("");
  let localError = $state<string | null>(null);
  let relayStatuses = $state<Record<string, 'pending' | 'found' | 'notfound'>>({});
  let foundEvent = $state<NDKEvent | null>(null);
  let searching = $state(false);

  $effect(() => {
    if (searchValue) {
      searchEvent(false, searchValue);
    }
  });

  $effect(() => {
    foundEvent = event;
  });

  async function searchEvent(clearInput: boolean = true, queryOverride?: string) {
    localError = null;
    const query = (queryOverride !== undefined ? queryOverride : searchQuery).trim();
    if (!query) return;

    // Only update the URL if this is a manual search
    if (clearInput) {
      const encoded = encodeURIComponent(query);
      goto(`?id=${encoded}`, { replaceState: false, keepFocus: true, noScroll: true });
    }

    if (clearInput) {
      searchQuery = '';
    }

    // Clean the query
    let cleanedQuery = query.replace(/^nostr:/, '');
    let filterOrId: any = cleanedQuery;
    console.log('[Events] Cleaned query:', cleanedQuery);

    // NIP-05 address pattern: user@domain
    if (/^[a-z0-9._-]+@[a-z0-9.-]+$/i.test(cleanedQuery)) {
      try {
        const [name, domain] = cleanedQuery.split('@');
        const res = await fetch(`https://${domain}/.well-known/nostr.json?name=${name}`);
        const data = await res.json();
        const pubkey = data.names?.[name];
        if (pubkey) {
          filterOrId = { kinds: [0], authors: [pubkey] };
          const profileEvent = await fetchEventWithFallback($ndkInstance, filterOrId, 10000);
          if (profileEvent) {
            handleFoundEvent(profileEvent);
            return;
          } else {
            localError = 'No profile found for this NIP-05 address.';
            return;
          }
        } else {
          localError = 'NIP-05 address not found.';
          return;
        }
      } catch (e) {
        localError = 'Error resolving NIP-05 address.';
        return;
      }
    }

    // If it's a 64-char hex, try as event id first, then as pubkey (profile)
    if (/^[a-f0-9]{64}$/i.test(cleanedQuery)) {
      // Try as event id
      filterOrId = cleanedQuery;
      const eventResult = await fetchEventWithFallback($ndkInstance, filterOrId, 10000);
      // Always try as pubkey (profile event) as well
      const profileFilter = { kinds: [0], authors: [cleanedQuery] };
      const profileEvent = await fetchEventWithFallback($ndkInstance, profileFilter, 10000);
      // Prefer profile if found and pubkey matches query
      if (profileEvent && profileEvent.pubkey.toLowerCase() === cleanedQuery.toLowerCase()) {
        handleFoundEvent(profileEvent);
      } else if (eventResult) {
        handleFoundEvent(eventResult);
      }
      return;
    } else if (/^(nevent|note|naddr|npub|nprofile)[a-z0-9]+$/i.test(cleanedQuery)) {
      try {
        const decoded = nip19.decode(cleanedQuery);
        if (!decoded) throw new Error('Invalid identifier');
        console.log('[Events] Decoded NIP-19:', decoded);
        switch (decoded.type) {
          case 'nevent':
            filterOrId = decoded.data.id;
            break;
          case 'note':
            filterOrId = decoded.data;
            break;
          case 'naddr':
            filterOrId = {
              kinds: [decoded.data.kind],
              authors: [decoded.data.pubkey],
              '#d': [decoded.data.identifier],
            };
            break;
          case 'nprofile':
            filterOrId = {
              kinds: [0],
              authors: [decoded.data.pubkey],
            };
            break;
          case 'npub':
            filterOrId = {
              kinds: [0],
              authors: [decoded.data],
            };
            break;
          default:
            filterOrId = cleanedQuery;
        }
        console.log('[Events] Using filterOrId:', filterOrId);
      } catch (e) {
        console.error('[Events] Invalid Nostr identifier:', cleanedQuery, e);
        localError = 'Invalid Nostr identifier.';
        return;
      }
    }

    try {
      console.log('Searching for event:', filterOrId);
      const event = await fetchEventWithFallback($ndkInstance, filterOrId, 10000);
      
      if (!event) {
        console.warn('[Events] Event not found for filterOrId:', filterOrId);
        localError = 'Event not found';
      } else {
        console.log('[Events] Event found:', event);
        handleFoundEvent(event);
      }
    } catch (err) {
      console.error('[Events] Error fetching event:', err, 'Query:', query);
      localError = 'Error fetching event. Please check the ID and try again.';
    }
  }

  function handleFoundEvent(event: NDKEvent) {
    foundEvent = event;
    onEventFound(event);
  }
</script>

<div class="flex flex-col space-y-6">
  <div class="flex gap-2">
    <Input
      bind:value={searchQuery}
      placeholder="Enter event ID, nevent, or naddr..."
      class="flex-grow"
      on:keydown={(e: KeyboardEvent) => e.key === 'Enter' && searchEvent(true)}
    />
    <Button on:click={() => searchEvent(true)} disabled={loading}>
      {loading ? 'Searching...' : 'Search'}
    </Button>
  </div>

  {#if localError || error}
    <div class="p-4 mb-4 text-sm text-red-700 bg-red-100 rounded-lg" role="alert">
      {localError || error}
      {#if searchQuery.trim()}
        <div class="mt-2">
          You can also try viewing this event on
          <a
            class="underline text-primary-700"
            href={"https://njump.me/" + encodeURIComponent(searchQuery.trim())}
            target="_blank"
            rel="noopener"
          >Njump</a>.
        </div>
      {/if}
    </div>
  {/if}

  <div class="mt-4">
    <div class="flex flex-wrap gap-2">
      {#each Object.entries(relayStatuses) as [relay, status]}
        <RelayDisplay {relay} showStatus={true} status={status} />
      {/each}
    </div>
    {#if !foundEvent && Object.values(relayStatuses).some(s => s === 'pending')}
      <div class="text-gray-500 mt-2">Searching relays...</div>
    {/if}
    {#if !foundEvent && !searching && Object.values(relayStatuses).every(s => s !== 'pending')}
      <div class="text-red-500 mt-2">Event not found on any relay.</div>
    {/if}
  </div>
</div> 