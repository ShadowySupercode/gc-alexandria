<script lang="ts">
  import { Badge } from "flowbite-svelte";
  import { ndkInstance } from "$lib/ndk";
  import { searchEventByIdentifier } from "$lib/utils/nostrUtils";
  import { goto } from '$app/navigation';
  import { NDKEvent } from "@nostr-dev-kit/ndk";
  import RelayDisplay from './RelayDisplay.svelte';
  import { fallbackRelays } from '$lib/consts';
  import SearchBar from './SearchBar.svelte';
  import { selectRelayGroup } from '$lib/utils/relayGroupUtils';
  
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
  let useFallbackRelays = $state(false);
  let relayInfo = $state<{ url: string; latency: number; group: string } | null>(null);
  let abortController = $state<AbortController | null>(null);
  let lastSearchedValue = $state<string | null>(null);
  let currentRelayGroup = $state<'primary' | 'fallback'>('primary');
  let searchBarComponent: SearchBar;

  let displayError = $derived.by(() => localError || error);
  let showNjumpLink = $derived.by(() => searchQuery.trim() && !localError?.includes('cancelled'));
  let relayStatusMessage = $derived.by(() => {
    if (searching) return "Searching relays...";
    if (!foundEvent && Object.values(relayStatuses).every(s => s === 'notfound')) {
      return "Event not found on any relay.";
    }
    return null;
  });

  let relayList = $derived.by(() => {
    return selectRelayGroup().map(url => ({
      url,
      status: relayStatuses[url] || 'pending',
      latency: relayInfo?.url === url ? relayInfo.latency : null
    }));
  });

  let searchUrl = $derived.by(() => {
    if (!searchQuery.trim()) return '';
    const encodedQuery = encodeURIComponent(searchQuery.trim());
    return `https://njump.me/${encodedQuery}`;
  });

  $effect(() => {
    if (searchValue && searchValue !== lastSearchedValue) {
      lastSearchedValue = searchValue;
      startSearch(searchValue, false);
    }
  });

  $effect(() => {
    foundEvent = event;
  });

  async function updateRelayStatuses(relays: string[]) {
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

    if (searchBarComponent) {
      searchBarComponent.stopSearching();
    }
  }

  async function startSearch(query: string, clearInput: boolean = true) {
    // Cancel any ongoing search
    if (searching) {
      cancelSearch();
      return;
    }

    // Reset state
    localError = null;
    relayInfo = null;
    searching = true;
    abortController = new AbortController();
    const signal = abortController.signal;

    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      searching = false;
      abortController = null;
      return;
    }

    // Get relays to search
    const ndk = $ndkInstance;
    const primaryRelays = selectRelayGroup();
    const fallback = useFallbackRelays ? fallbackRelays.filter(r => !primaryRelays.includes(r)) : [];
    await updateRelayStatuses([...primaryRelays, ...fallback]);

    // Only update the URL if this is a manual search
    if (clearInput) {
      const encoded = encodeURIComponent(trimmedQuery);
      goto(`?id=${encoded}`, { replaceState: false, keepFocus: true, noScroll: true });
      searchQuery = '';
    }

    try {
      const result = await searchEventByIdentifier(ndk, trimmedQuery, {
        timeoutMs: 10000,
        useFallbackRelays,
        signal
      });

      if (signal.aborted) {
        throw new Error('Search cancelled');
      }

      if (!result.event) {
        throw new Error(`No event found matching ${trimmedQuery}`);
      }

      relayInfo = result.relayInfo || null;
      if (relayInfo) {
        relayStatuses = { ...relayStatuses, [relayInfo.url]: 'found' };
      }
      handleFoundEvent(result.event);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('[Events] Search cancelled');
        return;
      }
      console.error('[Events] Error searching for event:', err, 'Query:', trimmedQuery);
      localError = err instanceof Error ? err.message : 'Unknown error';
      // Mark all relays as not found
      relayStatuses = Object.fromEntries(Object.keys(relayStatuses).map(relay => [relay, 'notfound']));
    } finally {
      searching = false;
      abortController = null;
    }
  }

  function handleFoundEvent(event: any) {
    const ndk = $ndkInstance;
    // If event is Immutable, convert to JS
    let rawEvent = event?.toJS ? event.toJS() : event;
    // Always wrap as NDKEvent
    let wrappedEvent = new NDKEvent(ndk, rawEvent);
    foundEvent = wrappedEvent;
    onEventFound(wrappedEvent);
  }
</script>

<div class="flex flex-col space-y-6">
  <div class="flex flex-col gap-4">
    <SearchBar
      bind:this={searchBarComponent}
      placeholder="Enter event ID, nevent, or naddr..."
      initialValue={searchQuery}
      showFallbackToggle={true}
      bind:useFallbackRelays
      disabled={loading}
      onDispatchSearch={(query, useFallbackRelays) => startSearch(query, true)}
      onDispatchCancel={cancelSearch}
      onDispatchClear={() => {
        if (searching) {
          cancelSearch();
        }
        searchQuery = '';
        localError = null;
        foundEvent = null;
        relayStatuses = {};
      }}
    />
  </div>

  {#if displayError}
    <div class="p-4 mb-4 text-sm text-red-700 bg-red-100 rounded-lg" role="alert">
      {displayError}
      {#if showNjumpLink}
        <div class="mt-2">
          You can also try viewing this event on
          <a
            class="underline text-primary-700"
            href={searchUrl}
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

  {#if !foundEvent}
    <div class="mt-4">
      <div class="flex flex-wrap gap-2">
        {#each relayList as { url, status, latency }}
          <RelayDisplay relay={url} showStatus={true} status={status} />
        {/each}
      </div>
      {#if relayStatusMessage}
        <div class="text-gray-500 mt-2">{relayStatusMessage}</div>
      {/if}
    </div>
  {/if}
</div> 