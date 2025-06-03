<script lang="ts">
  import { Badge } from "flowbite-svelte";
  import { searchEventByIdentifier, selectedRelayGroup, logCurrentRelays } from '$lib/utils';
  import { goto } from "$app/navigation";
  import type { NostrEvent } from "$lib/types/nostr";
  import RelayDisplay from "./RelayDisplay.svelte";
  import SearchBar from "./SearchBar.svelte";
  import { userInboxRelays, userOutboxRelays } from '$lib/stores/relayStore';
  import { includeLocalRelays } from '$lib/stores/relayGroup';
  import { responsiveLocalRelays } from '$lib/stores/relayStore';

  let {
    loading,
    error,
    searchValue,
    onEventFound,
    event,
  } = $props<{
    loading: boolean;
    error: string | null;
    searchValue: string | null;
    onEventFound: (event: NostrEvent) => void;
    event: NostrEvent | null;
  }>();

  let searchQuery = $state("");
  let localError = $state<string | null>(null);
  let relayStatuses = $state<Record<string, 'pending' | 'found' | 'notfound'>>({});
  let foundEvent = $state<NostrEvent | null>(null);
  let searching = $state(false);
  let relayInfo = $state<{
    url: string;
    latency: number;
    group: string;
  } | null>(null);
  let lastSearchedValue = $state<string | null>(null);
  let searchProgress = $state<{ processed: number; total: number; percentage: number } | null>(null);
  let searchSuccess = $state(false);

  let displayError = $derived.by(() => localError || error);
  let showNjumpLink = $derived.by(
    () => searchQuery.trim() && !localError?.includes("cancelled"),
  );
  let relayStatusMessage = $derived.by(() => {
    if (searching) return "Searching relays...";
    if (
      !foundEvent &&
      Object.values(relayStatuses).every((s) => s === "notfound")
    ) {
      return "Event not found on any relay.";
    }
    return null;
  });

  let relayList = $derived.by(() => {
    return Object.entries(relayStatuses).map(([url, status]) => ({
      url,
      status,
      latency: relayInfo?.url === url ? relayInfo.latency : null,
    }));
  });

  let searchUrl = $derived.by(() => {
    if (!searchQuery.trim()) return "";
    const encodedQuery = encodeURIComponent(searchQuery.trim());
    return `https://njump.me/${encodedQuery}`;
  });

  let showFallbackWarning = $derived(() => $selectedRelayGroup.inbox.length === 0);

  $effect(() => {
    if (searchValue && searchValue !== lastSearchedValue) {
      lastSearchedValue = searchValue;
      logCurrentRelays('event_search');
      startSearch(searchValue, false);
    }
  });

  $effect(() => {
    foundEvent = event;
  });

  $effect(() => {
    // If there is no searchValue, clear relayStatuses
    if (!searchValue) {
      relayStatuses = {};
    }
  });

  async function startSearch(query: string, clearInput: boolean = true, signal?: AbortSignal, options: { relayTimeout?: number } = {}) {
    if (!query.trim()) {
      searching = false;
      relayStatuses = {};
      return;
    }

    // Log relay status when manually searching
    if (clearInput) {
      logCurrentRelays('event_search');
    }

    // Remove 'nostr:' prefix if present
    let trimmedQuery = query.trim();
    if (trimmedQuery.startsWith('nostr:')) {
      trimmedQuery = trimmedQuery.slice(6);
    }

    // Only update the URL if this is a manual search
    if (clearInput) {
      const encoded = encodeURIComponent(trimmedQuery);
      goto(`?id=${encoded}`, {
        replaceState: false,
        keepFocus: true,
        noScroll: true,
      });
      searchQuery = "";
    }

    try {
      const result = await searchEventByIdentifier(trimmedQuery, {
        timeoutMs: options.relayTimeout || 10000, // Use timeout from SearchBar or default to 10s
        useFallbackRelays: true,
        signal,
        relays: $selectedRelayGroup.inbox,
      });

      if (signal?.aborted) {
        throw new Error("Search cancelled");
      }

      if (!result.event) {
        throw new Error(`No event found matching ${trimmedQuery}`);
      }

      relayInfo = result.relayInfo || null;
      if (relayInfo) {
        relayStatuses = { ...relayStatuses, [relayInfo.url]: "found" };
      }
      handleFoundEvent(result.event);
      console.log('Searching for', query, 'on relays:', $selectedRelayGroup.inbox);
    } catch (err) {
      // Filter out cancellation errors
      if (
        (err instanceof Error && err.name === 'AbortError') ||
        (err instanceof Error && err.message === 'Search cancelled')
      ) {
        console.log('[Events] Search cancelled');
        return;
      }
      console.error(
        '[Events] Error searching for event:',
        err,
        'Query:',
        trimmedQuery,
      );
      localError = err instanceof Error ? err.message : 'Unknown error';
      // Mark all relays as not found
      relayStatuses = Object.fromEntries(
        Object.keys(relayStatuses).map((relay) => [relay, 'notfound']),
      );
    } finally {
      searching = false;
    }
  }

  function handleFoundEvent(event: NostrEvent) {
    localError = null;
    foundEvent = event;
    onEventFound(event);
  }

  function handleSearchError(error: { message: string; code: string } | null) {
    if (error) {
      localError = error.message;
    }
  }

  function handleSearchProgress(progress: { processed: number; total: number; percentage: number } | null) {
    searchProgress = progress;
    if (progress && progress.percentage === 100) {
      searchSuccess = true;
      setTimeout(() => { searchSuccess = false; }, 2000);
    }
  }
</script>

<div class="flex flex-col space-y-6">
  {#if showFallbackWarning()}
    <div class="p-4 mb-2 text-sm text-yellow-800 bg-yellow-100 rounded-lg" role="alert">
      <strong>Info:</strong> No user relays are loaded, so the search will use community relays.
      Please ensure you are logged in and your relay settings are correct, if you wish to include your own relays.
    </div>
  {/if}
  <div class="flex flex-col gap-4">
    <SearchBar
      placeholder="Enter event ID, nevent, or naddr..."
      initialValue={searchQuery}
      searchDisabled={loading}
      clearDisabled={false}
      isSearching={searching}
      onDispatchSearch={(query, _, signal, options) => {
        searchQuery = query;
        searching = true;
        localError = null;
        startSearch(query, true, signal, options);
      }}
      onDispatchCancel={() => {
        searchQuery = '';
        localError = 'Search cancelled';
        searching = false;
        relayStatuses = {};
      }}
      onDispatchClear={() => {
        searchQuery = '';
        localError = null;
        foundEvent = null;
        relayStatuses = {};
        goto('/events', { replaceState: true, keepFocus: true, noScroll: true });
      }}
      onSearchError={handleSearchError}
      onSearchProgress={handleSearchProgress}
    />
  </div>

  {#if displayError && !foundEvent}
    <div
      class="p-4 mb-4 text-sm text-red-700 bg-red-100 rounded-lg"
      role="alert"
    >
      {displayError}
      {#if showNjumpLink}
        <div class="mt-2">
          You can also try viewing this event on
          <a
            class="underline text-primary-700"
            href={searchUrl}
            target="_blank"
            rel="noopener">Njump</a
          >.
        </div>
      {/if}
    </div>
  {/if}

  {#if foundEvent}
    <div
      class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400"
    >
      {#if relayInfo}
        <Badge color="green" class="font-mono">
          Found on {relayInfo.url} in {relayInfo.latency.toFixed(0)}ms
        </Badge>
        <span class="text-xs">({relayInfo.group} relay)</span>
      {/if}
    </div>
  {/if}

  {#if (searchValue || searchQuery) && !foundEvent}
    <div class="mt-4">
      <div class="flex flex-wrap gap-2">
        {#each relayList as { url, status, latency }}
          <RelayDisplay relay={url} showStatus={true} {status} />
        {/each}
      </div>
      {#if relayStatusMessage}
        <div class="text-gray-500 mt-2">{relayStatusMessage}</div>
      {/if}
    </div>
  {/if}

  {#if searchProgress}
    <div class="w-full bg-gray-200 rounded-full h-2.5 mb-4">
      <div
        class="bg-blue-500 h-2.5 rounded-full transition-all duration-300"
        style="width: {searchProgress.percentage}%"
      ></div>
    </div>
  {/if}
  {#if searchSuccess}
    <div class="text-blue-700 bg-blue-100 rounded px-2 py-1 mb-2 text-sm">
      Search complete!
    </div>
  {/if}
</div>
