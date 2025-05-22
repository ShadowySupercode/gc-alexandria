<script lang='ts'>
  import { indexKind } from '$lib/consts';
  import { ndkInstance } from '$lib/ndk';
  import { filterValidIndexEvents } from '$lib/utils';
  import { Button, P, Skeleton, Spinner, Alert } from 'flowbite-svelte';
  import ArticleHeader from './PublicationHeader.svelte';
  import SearchBar from './SearchBar.svelte';
  import { onMount, onDestroy } from 'svelte';
  import { NDKRelaySetFromNDK, type NDKEvent } from '$lib/utils/nostrUtils';
  import AdvancedSearchForm from './AdvancedSearchForm.svelte';
  import { fallbackRelays } from '$lib/consts';

  // Helper function to determine if an event is a parent publication
  function isParentPublication(event: NDKEvent): boolean {
    // Must be a 30040 event
    if (event.kind !== 30040) return false;
    
    // Must contain at least one 'a' tag that references another 30040
    return event.tags.some(tag => {
      if (tag[0] !== 'a') return false;
      const [kind] = tag[1].split(':');
      return kind === '30040';
    });
  }

  // Helper function to determine if an event is a top-level parent
  function isTopLevelParent(event: NDKEvent, allEvents: NDKEvent[]): boolean {
    // Must be a parent publication
    if (!isParentPublication(event)) return false;
    
    // Check if this event is referenced by any other parent publication
    const eventAddress = event.tagAddress();
    return !allEvents.some(otherEvent => 
      isParentPublication(otherEvent) && 
      otherEvent.tags.some(tag => tag[0] === 'a' && tag[1] === eventAddress)
    );
  }

  let { relays, searchQuery = '' } = $props<{ relays: string[], fallbackRelays: string[], searchQuery?: string }>();

  let eventsInView: NDKEvent[] = $state([]);
  let loadingMore: boolean = $state(false);
  let endOfFeed: boolean = $state(false);
  let relayStatuses = $state<Record<string, 'pending' | 'found' | 'notfound'>>({});
  let loading: boolean = $state(true);
  let isSearching = $state(false);
  let searchAbortController: AbortController | null = $state(null);
  let useFallbackRelays = $state(true);
  let searchBarComponent: SearchBar;
  let advancedSearchFilters = $state<Record<string, string>>({});
  let searchProgress = $state<{ processed: number; total: number; percentage: number } | null>(null);
  let searchError = $state<{ message: string; code: string } | null>(null);
  let searchTimeout: number | null = $state(null);

  let cutoffTimestamp: number = $derived(
    eventsInView?.at(eventsInView.length - 1)?.created_at ?? new Date().getTime()
  );

  // Create a worker instance
  let searchWorker: Worker;
  let workerInitialized = false;
  let allEvents: NDKEvent[] = $state([]); // Store all events for autocomplete

  // Constants
  const CHUNK_SIZE = 100;
  const SEARCH_TIMEOUT = 30000; // 30 seconds timeout for search operations

  async function abortCurrentSearch() {
    if (searchAbortController) {
      searchAbortController.abort();
      searchAbortController = null;
    }
    isSearching = false;
    if (searchBarComponent) {
      searchBarComponent.stopSearching();
    }
  }

  async function getEvents(
    before: number | undefined = undefined, 
    search: string = '', 
    reset: boolean = false,
    abortSignal?: AbortSignal
  ) {
    if (abortSignal?.aborted) {
      loading = false;
      return;
    }
    
    // Reset states
    searchError = null;
    searchProgress = null;
    loading = true;
    
    // Set a timeout for the search operation
    if (search || Object.values(advancedSearchFilters).some(v => v)) {
      searchTimeout = window.setTimeout(() => {
        if (isSearching) {
          searchError = {
            message: 'Search operation timed out',
            code: 'TIMEOUT'
          };
          loading = false;
          isSearching = false;
          searchProgress = null;
          abortCurrentSearch();
        }
      }, SEARCH_TIMEOUT);
    }

    const ndk = $ndkInstance;
    const primaryRelays: string[] = relays;
    const fallback: string[] = useFallbackRelays ? 
      fallbackRelays.filter((r: string) => !primaryRelays.includes(r)) : 
      [];
    
    relayStatuses = Object.fromEntries([
      ...primaryRelays.map((r: string) => [r, 'pending']),
      ...fallback.map((r: string) => [r, 'pending'])
    ]);
    
    let fetchedCount = 0;

    // First, try primary relays
    let foundEventsInPrimary = false;
    const primaryResults = await Promise.allSettled(
      primaryRelays.map(async (relay: string) => {
        if (abortSignal?.aborted) return;
        
        try {
          const relaySet = NDKRelaySetFromNDK.fromRelayUrls([relay], ndk);
          let eventSet = await ndk.fetchEvents(
            {
              kinds: [indexKind],
              limit: 30,
              until: before,
            },
            {
              groupable: false,
              skipVerification: false,
              skipValidation: false,
            },
            relaySet
          ).withTimeout(2500);
          
          if (abortSignal?.aborted) return;
          
          eventSet = filterValidIndexEvents(eventSet);
          const newEvents = Array.from(eventSet);
          allEvents = allEvents.concat(newEvents);
          allEvents = allEvents.filter((event, index, self) => 
            index === self.findIndex((e) => e.tagAddress() === event.tagAddress())
          );
          
          if (eventSet.size > 0) {
            relayStatuses = { ...relayStatuses, [relay]: 'found' };
            foundEventsInPrimary = true;
          } else {
            relayStatuses = { ...relayStatuses, [relay]: 'notfound' };
          }
        } catch (err) {
          if (!abortSignal?.aborted) {
            console.error(`Error fetching from primary relay ${relay}:`, err);
            relayStatuses = { ...relayStatuses, [relay]: 'notfound' };
          }
        }
      })
    );

    // Only try fallback relays if no events were found in primary relays
    if (!foundEventsInPrimary && fallback.length > 0 && !abortSignal?.aborted) {
      await Promise.allSettled(
        fallback.map(async (relay: string) => {
          if (abortSignal?.aborted) return;
          
          try {
            const relaySet = NDKRelaySetFromNDK.fromRelayUrls([relay], ndk);
            let eventSet = await ndk.fetchEvents(
              {
                kinds: [indexKind],
                limit: 18,
                until: before,
              },
              {
                groupable: false,
                skipVerification: false,
                skipValidation: false,
              },
              relaySet
            ).withTimeout(2500);
            
            if (abortSignal?.aborted) return;
            
            eventSet = filterValidIndexEvents(eventSet);
            const newEvents = Array.from(eventSet);
            allEvents = allEvents.concat(newEvents);
            allEvents = allEvents.filter((event, index, self) => 
              index === self.findIndex((e) => e.tagAddress() === event.tagAddress())
            );
            
            if (eventSet.size > 0) {
              relayStatuses = { ...relayStatuses, [relay]: 'found' };
            } else {
              relayStatuses = { ...relayStatuses, [relay]: 'notfound' };
            }
          } catch (err) {
            if (!abortSignal?.aborted) {
              console.error(`Error fetching from fallback relay ${relay}:`, err);
              relayStatuses = { ...relayStatuses, [relay]: 'notfound' };
            }
          }
        })
      );
    }

    // Use the worker to perform search if we have events and a search query
    if (workerInitialized && (search || Object.values(advancedSearchFilters).some(v => v))) {
      searchWorker.postMessage({
        type: 'SEARCH',
        events: allEvents,
        query: search,
        filters: advancedSearchFilters,
        chunkSize: CHUNK_SIZE
      });
    } else {
      // If no search or worker not initialized, just update the view
      const eventMap = new Map([...eventsInView, ...allEvents].map(event => [event.tagAddress(), event]));
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
        return b.created_at! - a.created_at!;
      });
      eventsInView = uniqueEvents;
      loading = false;
    }

    // Update search bar with events for autocomplete
    if (searchBarComponent) {
      searchBarComponent.updateEvents(allEvents);
    }

    const pageSize = fallback.length > 0 ? 18 : 30;
    endOfFeed = fetchedCount < pageSize;
  }

  const getSkeletonIds = (): string[] => {
    const skeletonHeight = 124; // The height of the skeleton component in pixels.
    const skeletonCount = Math.floor(window.innerHeight / skeletonHeight) - 2;
    const skeletonIds = [];
    for (let i = 0; i < skeletonCount; i++) {
      skeletonIds.push(`skeleton-${i}`);
    }
    return skeletonIds;
  }

  async function loadMorePublications() {
    loadingMore = true;
    await getEvents(cutoffTimestamp, searchQuery, false);
    loadingMore = false;
  }

  onMount(() => {
    // Initialize the worker
    searchWorker = new Worker(new URL('../workers/searchWorker.ts', import.meta.url), { type: 'module' });
    workerInitialized = true;

    // Handle worker messages
    searchWorker.onmessage = (e: MessageEvent) => {
      const { type, results, progress, error } = e.data;
      
      switch (type) {
        case 'SEARCH_RESULT':
          // Clear any existing timeout
          if (searchTimeout) {
            window.clearTimeout(searchTimeout);
            searchTimeout = null;
          }
          
          // Update the view with search results
          const eventMap = new Map([...eventsInView, ...results].map(event => [event.tagAddress(), event]));
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
            return b.created_at! - a.created_at!;
          });
          eventsInView = uniqueEvents;
          
          // Update allEvents for autocomplete
          allEvents = allEvents.concat(results);
          allEvents = allEvents.filter((event, index, self) => 
            index === self.findIndex((e) => e.tagAddress() === event.tagAddress())
          );
          
          if (searchBarComponent) {
            searchBarComponent.updateEvents(allEvents);
          }
          
          loading = false;
          isSearching = false;
          searchProgress = null;
          searchError = null;
          break;
          
        case 'SEARCH_PROGRESS':
          searchProgress = progress;
          break;
          
        case 'SEARCH_ERROR':
          searchError = error;
          loading = false;
          isSearching = false;
          searchProgress = null;
          break;
      }
    };

    // Handle worker errors
    searchWorker.onerror = (error) => {
      console.error('Search worker error:', error);
      searchError = {
        message: 'An error occurred in the search worker',
        code: 'WORKER_ERROR'
      };
      loading = false;
      isSearching = false;
      searchProgress = null;
    };

    // Initial load
    getEvents();
  });

  onDestroy(() => {
    if (workerInitialized) {
      searchWorker.terminate();
    }
  });
</script>

<div class='leather'>
  <div class="mb-6 space-y-4">
    {#if searchError}
      <Alert color="red" dismissable on:close={() => searchError = null}>
        <span class="font-medium">Search Error:</span> {searchError.message}
      </Alert>
    {/if}
    
    {#if searchProgress}
      <div class="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
        <div 
          class="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
          style="width: {searchProgress.percentage}%"
        ></div>
      </div>
      <p class="text-sm text-gray-600 dark:text-gray-400 text-center">
        Searching... {searchProgress.processed} of {searchProgress.total} events ({searchProgress.percentage}%)
      </p>
    {/if}

    <SearchBar
      bind:this={searchBarComponent}
      placeholder="Search publications by title or author..."
      showFallbackToggle={true}
      bind:useFallbackRelays
      on:search={async ({ detail }) => {
        await abortCurrentSearch();
        searchAbortController = new AbortController();
        isSearching = true;
        eventsInView = [];
        await getEvents(undefined, detail.query, true, searchAbortController.signal);
        isSearching = false;
      }}
      on:cancel={async () => {
        await abortCurrentSearch();
        isSearching = false;
      }}
      on:clear={async () => {
        await abortCurrentSearch();
        isSearching = false;
        eventsInView = [];
        await getEvents(undefined, '', true);
      }}
    />
    
    <AdvancedSearchForm
      on:search={async ({ detail }) => {
        await abortCurrentSearch();
        searchAbortController = new AbortController();
        isSearching = true;
        eventsInView = [];
        advancedSearchFilters = detail.filters;
        await getEvents(undefined, detail.query, true, searchAbortController.signal);
        isSearching = false;
      }}
      on:cancel={async () => {
        await abortCurrentSearch();
        isSearching = false;
      }}
      on:clear={async () => {
        await abortCurrentSearch();
        isSearching = false;
        advancedSearchFilters = {};
        eventsInView = [];
        await getEvents(undefined, '', true);
      }}
    />
  </div>

  <div class='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
    {#if loading && eventsInView.length === 0}
      {#each getSkeletonIds() as id}
        <Skeleton divClass='skeleton-leather w-full' size='lg' />
      {/each}
    {:else if eventsInView.length > 0}
      {#each eventsInView as event}
        <ArticleHeader {event} />
      {/each}
    {:else if searchQuery.trim()}
      <div class='col-span-full'>
        <p class='text-center'>No publications found matching "{searchQuery}".</p>
      </div>
    {:else}
      <div class='col-span-full'>
        <p class='text-center'>No publications found.</p>
      </div>
    {/if}
  </div>

  {#if !loadingMore && !endOfFeed && !isSearching}
    <div class='flex justify-center mt-4 mb-8'>
      <Button outline class="w-full max-w-md" onclick={async () => {
        await loadMorePublications();
      }}>
        Show more publications
      </Button>
    </div>
  {:else if loadingMore || isSearching}
    <div class='flex justify-center mt-4 mb-8'>
      <Button outline disabled class="w-full max-w-md">
        <Spinner class='mr-3 text-gray-300' size='4' />
        {isSearching ? 'Searching...' : 'Loading...'}
      </Button>
    </div>
  {:else}
    <div class='flex justify-center mt-4 mb-8'>
      <P class='text-sm text-gray-600'>You've reached the end of the feed.</P>
    </div>
  {/if}
</div>
