<script lang="ts">
  import { Input, Button, Checkbox, Badge } from "flowbite-svelte";
  import { ndkInstance } from "$lib/ndk";
  import { fetchEventWithFallback } from "$lib/utils/nostrUtils";
  import { nip19 } from '$lib/utils/nostrUtils';
  import { goto } from '$app/navigation';
  import type { NDKEvent } from '$lib/utils/nostrUtils';
  import RelayDisplay from './RelayDisplay.svelte';
  import { fallbackRelays } from '$lib/consts';

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
  let useFallbackRelays = $state(true);
  let relayInfo = $state<{ url: string; latency: number; group: string } | null>(null);
  let abortController = $state<AbortController | null>(null);

  $effect(() => {
    if (searchValue) {
      searchEvent(false, searchValue);
    }
  });

  $effect(() => {
    foundEvent = event;
  });

  async function updateRelayStatuses(relays: string[]) {
    // Reset all relay statuses to pending
    relayStatuses = Object.fromEntries(relays.map(relay => [relay, 'pending']));
  }

  function cancelSearch() {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    searching = false;
    localError = "Search cancelled";
    // Mark all pending relays as not found
    relayStatuses = Object.fromEntries(
      Object.entries(relayStatuses).map(([relay, status]) => [
        relay,
        status === 'pending' ? 'notfound' : status
      ])
    );
  }

  async function searchEvent(clearInput: boolean = true, queryOverride?: string) {
    // Cancel any ongoing search
    if (searching) {
      cancelSearch();
      return;
    }

    localError = null;
    relayInfo = null;
    searching = true;
    abortController = new AbortController();
    const signal = abortController.signal;

    const query = (queryOverride !== undefined ? queryOverride : searchQuery).trim();
    if (!query) {
      searching = false;
      abortController = null;
      return;
    }

    // Get all relays to search
    const ndk = $ndkInstance;
    const userRelays = Array.from(ndk?.pool?.relays.values() || []).map(r => r.url);
    const allRelays = [...new Set([...userRelays, ...(useFallbackRelays ? fallbackRelays : [])])];
    await updateRelayStatuses(allRelays);

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

    try {
      // Check for cancellation before each major operation
      if (signal.aborted) {
        throw new Error('Search cancelled');
      }

      // NIP-05 address pattern: user@domain
      if (/^[a-z0-9._-]+@[a-z0-9.-]+$/i.test(cleanedQuery)) {
        try {
          const [name, domain] = cleanedQuery.split('@');
          const res = await fetch(`https://${domain}/.well-known/nostr.json?name=${name}`, { signal });
          if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
          }
          const data = await res.json();
          const pubkey = data.names?.[name];
          if (pubkey) {
            filterOrId = { kinds: [0], authors: [pubkey] };
            const result = await fetchEventWithFallback($ndkInstance, filterOrId, 10000, useFallbackRelays, signal);
            if (result.event) {
              relayInfo = result.relayInfo || null;
              if (relayInfo) {
                relayStatuses = { ...relayStatuses, [relayInfo.url]: 'found' };
              }
              handleFoundEvent(result.event);
              return;
            } else {
              localError = `No profile found for NIP-05 address ${cleanedQuery}`;
              return;
            }
          } else {
            localError = `NIP-05 address ${cleanedQuery} not found on ${domain}`;
            return;
          }
        } catch (e) {
          if (e instanceof Error && e.name === 'AbortError') {
            throw new Error('Search cancelled');
          }
          console.error('[Events] NIP-05 resolution error:', e);
          localError = `Error resolving NIP-05 address ${cleanedQuery}: ${e instanceof Error ? e.message : 'Unknown error'}`;
          return;
        }
      }

      // If it's a 64-char hex, try as event id first, then as pubkey (profile)
      if (/^[a-f0-9]{64}$/i.test(cleanedQuery)) {
        // Start both searches immediately
        const eventPromise = fetchEventWithFallback($ndkInstance, cleanedQuery, 10000, useFallbackRelays, signal);
        const profilePromise = fetchEventWithFallback(
          $ndkInstance, 
          { kinds: [0], authors: [cleanedQuery] }, 
          10000,
          useFallbackRelays,
          signal
        );

        try {
          // Wait for both promises to settle
          const [eventResult, profileResult] = await Promise.allSettled([
            eventPromise,
            profilePromise
          ]);

          if (signal.aborted) {
            throw new Error('Search cancelled');
          }

          // Check profile first (preferred if pubkey matches)
          if (profileResult.status === 'fulfilled' && profileResult.value.event && 
              profileResult.value.event.pubkey.toLowerCase() === cleanedQuery.toLowerCase()) {
            relayInfo = profileResult.value.relayInfo || null;
            if (relayInfo) {
              relayStatuses = { ...relayStatuses, [relayInfo.url]: 'found' };
            }
            handleFoundEvent(profileResult.value.event);
            return;
          }

          // Then check event result
          if (eventResult.status === 'fulfilled' && eventResult.value.event) {
            relayInfo = eventResult.value.relayInfo || null;
            if (relayInfo) {
              relayStatuses = { ...relayStatuses, [relayInfo.url]: 'found' };
            }
            handleFoundEvent(eventResult.value.event);
            return;
          }

          // If we get here, neither search found a result
          localError = `No event or profile found for ID ${cleanedQuery}`;
          // Mark all relays as not found
          relayStatuses = Object.fromEntries(Object.keys(relayStatuses).map(relay => [relay, 'notfound']));
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            throw new Error('Search cancelled');
          }
          console.error('[Events] Error searching for event/profile:', error);
          localError = `Error searching for event/profile ${cleanedQuery}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
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
              throw new Error(`Unsupported NIP-19 type: ${decoded.type}`);
          }
          console.log('[Events] Using filterOrId:', filterOrId);
        } catch (e) {
          console.error('[Events] Invalid Nostr identifier:', cleanedQuery, e);
          localError = `Invalid Nostr identifier ${cleanedQuery}: ${e instanceof Error ? e.message : 'Unknown error'}`;
          return;
        }
      }

      if (signal.aborted) {
        throw new Error('Search cancelled');
      }

      console.log('Searching for event:', filterOrId);
      const result = await fetchEventWithFallback($ndkInstance, filterOrId, 10000, useFallbackRelays, signal);
      
      if (signal.aborted) {
        throw new Error('Search cancelled');
      }

      if (!result.event) {
        console.warn('[Events] Event not found for filterOrId:', filterOrId);
        localError = `No event found matching ${cleanedQuery}`;
        // Mark all relays as not found
        relayStatuses = Object.fromEntries(Object.keys(relayStatuses).map(relay => [relay, 'notfound']));
      } else {
        console.log('[Events] Event found:', result.event);
        relayInfo = result.relayInfo || null;
        if (relayInfo) {
          relayStatuses = { ...relayStatuses, [relayInfo.url]: 'found' };
        }
        handleFoundEvent(result.event);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('[Events] Search cancelled');
        return;
      }
      console.error('[Events] Error fetching event:', err, 'Query:', query);
      localError = `Error fetching event ${cleanedQuery}: ${err instanceof Error ? err.message : 'Unknown error'}`;
      // Mark all relays as not found
      relayStatuses = Object.fromEntries(Object.keys(relayStatuses).map(relay => [relay, 'notfound']));
    } finally {
      searching = false;
      abortController = null;
    }
  }

  function handleFoundEvent(event: NDKEvent) {
    foundEvent = event;
    onEventFound(event);
  }
</script>

<div class="flex flex-col space-y-6">
  <div class="flex flex-col gap-4">
    <div class="flex gap-2">
      <Input
        bind:value={searchQuery}
        placeholder="Enter event ID, nevent, or naddr..."
        class="flex-grow"
        on:keydown={(e: KeyboardEvent) => e.key === 'Enter' && searchEvent(true)}
        disabled={searching}
      />
      <Button 
        on:click={() => searchEvent(true)} 
        disabled={loading}
        color={searching ? "red" : "blue"}
      >
        {#if searching}
          Cancel
        {:else if loading}
          Loading...
        {:else}
          Search
        {/if}
      </Button>
    </div>
    <div class="flex items-center gap-2">
      <Checkbox
        bind:checked={useFallbackRelays}
        id="use-fallback-relays"
        disabled={searching}
      />
      <label for="use-fallback-relays" class="text-sm text-gray-600 dark:text-gray-400">
        Include fallback relays (may expose your data to additional relay operators)
      </label>
    </div>
  </div>

  {#if localError || error}
    <div class="p-4 mb-4 text-sm text-red-700 bg-red-100 rounded-lg" role="alert">
      {localError || error}
      {#if searchQuery.trim() && !localError?.includes('cancelled')}
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

  {#if foundEvent}
    <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
      {#if relayInfo}
        <Badge color="green" class="font-mono">
          Found on {relayInfo.url} in {relayInfo.latency.toFixed(0)}ms
        </Badge>
        <span class="text-xs">({relayInfo.group} relay)</span>
      {/if}
    </div>
  {/if}

  <div class="mt-4">
    <div class="flex flex-wrap gap-2">
      {#each Object.entries(relayStatuses) as [relay, status]}
        <RelayDisplay {relay} showStatus={true} status={status} />
      {/each}
    </div>
    {#if searching}
      <div class="text-gray-500 mt-2">Searching relays...</div>
    {:else if !foundEvent && Object.values(relayStatuses).every(s => s === 'notfound')}
      <div class="text-red-500 mt-2">Event not found on any relay.</div>
    {/if}
  </div>
</div> 