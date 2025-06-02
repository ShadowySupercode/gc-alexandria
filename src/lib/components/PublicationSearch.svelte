<script lang="ts">
  import { indexKind } from "$lib/consts";
  import { getNostrClient } from '$lib/nostr/client';
  import { filterValidIndexEvents } from "$lib/utils";
  import { onDestroy, onMount } from "svelte";
  import { selectedRelayGroup } from '$lib/utils';
  import SearchBar from "./SearchBar.svelte";
  import type { NostrEvent } from '$lib/types/nostr';
  import { isParentPublication, isTopLevelParent } from '$lib/utils';
  import type { NostrFilter } from '$lib/types/nostr';

  let {
    searchQuery = "",
    onSearchResults = (events: NostrEvent[]) => {},
    onSearchError = (error: { message: string; code: string } | null) => {},
    onSearchProgress = (progress: { processed: number; total: number; percentage: number } | null) => {},
  } = $props<{
    searchQuery?: string;
    onSearchResults?: (events: NostrEvent[]) => void;
    onSearchError?: (error: { message: string; code: string } | null) => void;
    onSearchProgress?: (progress: { processed: number; total: number; percentage: number } | null) => void;
  }>();

  let loading = $state(false);
  let isSearching = $state(false);
  let searchError = $state<{ message: string; code: string } | null>(null);
  let relayStatuses = $state<Record<string, "pending" | "found" | "notfound">>({});
  let allEvents = $state<NostrEvent[]>([]);

  async function search(
    before: number | undefined = undefined,
    search: string = "",
    relays: string[] = $selectedRelayGroup.inbox,
    signal?: AbortSignal,
    options: { relayTimeout?: number } = {},
  ) {
    if (signal?.aborted) {
      loading = false;
      return;
    }

    // Reset states
    searchError = null;
    onSearchError(null);
    onSearchProgress(null);
    loading = true;
    isSearching = true;

    const client = getNostrClient(relays);
    if (!client) {
      searchError = { message: 'Failed to initialize client', code: 'CLIENT_ERROR' };
      onSearchError(searchError);
      loading = false;
      isSearching = false;
      return;
    }

    relayStatuses = Object.fromEntries(
      relays.map((r: string) => [r, "pending"] as const),
    );

    // Try all relays
    const primaryResults = await Promise.allSettled(
      relays.map(async (relay: string) => {
        if (signal?.aborted) return;

        try {
          const filter: NostrFilter = {
            kinds: [indexKind],
            limit: 30,
            until: before,
            search,
          };

          const events = await client.fetchEvents(filter);
          if (signal?.aborted) return;

          const validEvents = filterValidIndexEvents(new Set(events));
          const newEvents = Array.from(validEvents);
          allEvents = allEvents.concat(newEvents);
          allEvents = allEvents.filter(
            (event, index, self) =>
              index ===
              self.findIndex((e) => e.id === event.id),
          );

          if (events.length > 0) {
            relayStatuses = { ...relayStatuses, [relay]: "found" };
          } else {
            relayStatuses = { ...relayStatuses, [relay]: "notfound" };
          }
        } catch (err) {
          // Filter out cancellation errors
          if (
            (err instanceof Error && err.name === 'AbortError') ||
            (err instanceof Error && err.message === 'Search cancelled') ||
            (signal?.aborted)
          ) {
            return;
          }
          console.error(`Error fetching from relay ${relay}:`, err);
          relayStatuses = { ...relayStatuses, [relay]: 'notfound' };
        }
      }),
    );

    // Process and sort events
    const eventMap = new Map(
      allEvents.map((event) => [
        event.id,
        event,
      ]),
    );
    const uniqueEvents = Array.from(eventMap.values()).sort((a, b) => {
      // First sort by hierarchy level (top-level parents first, then other parents, then children)
      const aIsTopLevel = isTopLevelParent(a, Array.from(eventMap.values()));
      const bIsTopLevel = isTopLevelParent(b, Array.from(eventMap.values()));
      if (aIsTopLevel !== bIsTopLevel) {
        return aIsTopLevel ? -1 : 1;
      }

      const aIsParent = isParentPublication(a);
      const bIsParent = isParentPublication(b);
      if (aIsParent !== bIsParent) {
        return aIsParent ? -1 : 1;
      }

      // Then sort by creation date (newest first)
      return b.created_at - a.created_at;
    });

    onSearchResults(uniqueEvents);
    loading = false;
    isSearching = false;
  }

  onMount(() => {
    if (searchQuery) {
      search(undefined, searchQuery);
    }
  });

  onDestroy(() => {
  });

  $effect(() => {
    if (searchQuery) {
      const controller = new AbortController();
      search(undefined, searchQuery, undefined, controller.signal);
      return () => controller.abort();
    }
  });
</script>

<div class="flex flex-col gap-4">
  <div class="flex flex-col gap-2">
    <SearchBar
      placeholder="Search publications..."
      initialValue={searchQuery}
      searchDisabled={loading}
      clearDisabled={false}
      isSearching={isSearching}
      onDispatchSearch={(query, relays, signal, options) => {
        searchQuery = query;
        searchError = null;
        onSearchError(null);
        allEvents = [];
        search(undefined, query, relays, signal, options);
      }}
      onDispatchCancel={() => {
        searchQuery = '';
        searchError = null;
        onSearchError(null);
        allEvents = [];
        search(undefined, '', [], undefined);
      }}
      onDispatchClear={() => {
        searchQuery = '';
        searchError = null;
        onSearchError(null);
        allEvents = [];
        search(undefined, '', [], undefined);
      }}
      onSearchError={onSearchError}
      onSearchProgress={onSearchProgress}
    />
  </div>
</div> 