<script lang='ts'>
  import { indexKind } from '$lib/consts';
  import { ndkInstance } from '$lib/ndk';
  import { filterValidIndexEvents } from '$lib/utils';
  import { Button, Skeleton, Spinner, Alert } from 'flowbite-svelte';
  import ArticleHeader from './PublicationHeader.svelte';
  import SearchBar from './SearchBar.svelte';
  import { onMount, onDestroy } from 'svelte';
  import { NDKRelaySetFromNDK, type NDKEvent, isParentPublication, isTopLevelParent } from '$lib/utils/nostrUtils';
  import { standardRelays } from '$lib/consts';

  let { searchQuery = '', useFallbackRelays = $bindable(true), loggedIn, userRelays, fallbackRelays } = $props<{ searchQuery?: string, useFallbackRelays?: boolean, loggedIn: boolean, userRelays: string[], fallbackRelays: string[] }>();

  let eventsInView: NDKEvent[] = $state([]);
  let loadingMore: boolean = $state(false);
  let endOfFeed: boolean = $state(false);
  let relayStatuses = $state<Record<string, 'pending' | 'found' | 'notfound'>>({});
  let loading: boolean = $state(true);
  let isSearching = $state(false);
  let searchAbortController: AbortController | null = $state(null);
  let searchBarComponent: SearchBar;
  let processedEvents = $state(0);
  let totalEvents = $state(0);
  let searchError = $state<{ message: string; code: string } | null>(null);
  let searchTimeout: number | null = $state(null);

  // Convert more state variables to derived values
  let isLoading = $derived.by(() => loading || loadingMore);
  let hasError = $derived.by(() => searchError !== null);
  let canLoadMore = $derived.by(() => !endOfFeed && !isLoading && !isSearching);
  let showSearchProgress = $derived.by(() => isSearching && totalEvents > 0);
  let searchProgressPercentage = $derived.by(() => {
    if (!showSearchProgress) return 0;
    return Math.round((processedEvents / totalEvents) * 100);
  });

  let cutoffTimestamp: number = $derived.by(() => 
    eventsInView?.at(eventsInView.length - 1)?.created_at ?? new Date().getTime()
  );

  // Convert searchProgress to a derived value
  let searchProgress = $derived.by(() => {
    if (!showSearchProgress) return null;
    return {
      processed: processedEvents,
      total: totalEvents,
      percentage: searchProgressPercentage
    };
  });

  // Create a worker instance
  let searchWorker: Worker;
  let workerInitialized = false;
  let allEvents: NDKEvent[] = $state([]); // Store all events for autocomplete

  // Constants
  const CHUNK_SIZE = 100;
  const SEARCH_TIMEOUT = 30000; // 30 seconds timeout for search operations

  let relayGroup = $state<'alexandria' | 'user'>('alexandria');
  let relaysToUse = $derived.by(() =>
    relayGroup === 'alexandria'
      ? standardRelays
      : userRelays
  );

  let showRelayDropdown = $state(false);

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
    if (search) {
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
    // Use all relays from props as primaryRelays
    const primaryRelays: string[] = relaysToUse;
    const fallback: string[] = useFallbackRelays ? fallbackRelays.filter((r: string) => !primaryRelays.includes(r)) : [];
    
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
    if (workerInitialized && search) {
      searchWorker.postMessage({
        type: 'SEARCH',
        events: allEvents.map(event => event.rawEvent()),
        query: search,
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

<!-- Controls White Box -->
<div class="mx-auto my-8 max-w-2xl bg-white dark:bg-brown-900 border border-brown-300 dark:border-brown-700 rounded-lg shadow-sm px-6 py-5 text-gray-900 dark:text-gray-100">
  <!-- Relay Group Selector -->
  <div class="mb-4 relative">
    <button
      type="button"
      class="inline-flex items-center px-4 py-2 bg-white dark:bg-brown-800 border border-brown-300 dark:border-brown-700 text-gray-900 dark:text-gray-100 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-brown-400 transition disabled:bg-gray-200 disabled:text-gray-400 disabled:border-gray-200 disabled:dark:bg-brown-900 disabled:dark:text-brown-400 disabled:dark:border-brown-800 disabled:cursor-not-allowed"
      onclick={() => showRelayDropdown = !showRelayDropdown}
      aria-haspopup="true"
      aria-expanded={showRelayDropdown}
      disabled={!loggedIn}
      aria-label="Relay group selector"
    >
      <span class="font-medium text-gray-900 dark:text-gray-100">
        {relayGroup === 'alexandria' ? "Alexandria's Relays" : 'Your Relays'}
      </span>
      {#if loggedIn}
        <svg class="ml-2 h-5 w-5 text-gray-900 dark:text-gray-100" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
      {/if}
    </button>
    {#if showRelayDropdown}
      <div class="origin-top-right absolute left-0 mt-2 w-64 rounded-lg shadow-lg bg-white dark:bg-brown-900 text-gray-900 dark:text-gray-100 ring-1 ring-black ring-opacity-5 z-10 border border-brown-300 dark:border-brown-700">
        <div class="py-2">
          <label class="flex items-center px-4 py-2 cursor-pointer hover:bg-brown-100 dark:hover:bg-brown-800 text-gray-900 dark:text-gray-100">
            <input
              type="radio"
              class="form-radio text-brown-700 focus:ring-brown-400 bg-white dark:bg-brown-800 border-brown-300 dark:border-brown-700"
              name="relayGroup"
              value="alexandria"
              checked={relayGroup === 'alexandria'}
              onchange={() => { relayGroup = 'alexandria'; showRelayDropdown = false; }}
              aria-label="Select Alexandria's Relays"
            />
            <span class="ml-3 text-gray-900 dark:text-gray-100">Alexandria's Relays</span>
          </label>
          <label class="flex items-center px-4 py-2 cursor-pointer hover:bg-brown-100 dark:hover:bg-brown-800 text-gray-900 dark:text-gray-100">
            <input
              type="radio"
              class="form-radio text-brown-700 focus:ring-brown-400 bg-white dark:bg-brown-800 border-brown-300 dark:border-brown-700"
              name="relayGroup"
              value="user"
              checked={relayGroup === 'user'}
              onchange={() => { relayGroup = 'user'; showRelayDropdown = false; }}
              aria-label="Select Your Relays"
            />
            <span class="ml-3 text-gray-900 dark:text-gray-100">Your Relays</span>
          </label>
        </div>
      </div>
    {/if}
  </div>

  <!-- Search Bar, Fallback Toggle, Search and Clear Buttons -->
  <div class="flex flex-row items-center gap-3 mb-4">
    <div class="flex-1 rounded-md shadow-sm bg-white dark:bg-brown-800">
      <SearchBar
        bind:this={searchBarComponent}
        placeholder="Search publications by title or author..."
        showFallbackToggle={false}
        bind:useFallbackRelays
        on:SearchBarSearch={async ({ detail }) => {
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
    </div>
    <label class="flex items-center ml-2 cursor-pointer select-none text-gray-900 dark:text-gray-100">
      <input
        type="checkbox"
        bind:checked={useFallbackRelays}
        class="form-checkbox h-5 w-5 text-brown-700 focus:ring-brown-400 border-brown-400 rounded bg-white dark:bg-brown-800 border-brown-300 dark:border-brown-700"
        title={`Fallback relays:\n${fallbackRelays?.join('\n') ?? ''}`}
        aria-label="Toggle fallback relays"
      />
      <span class="ml-2 text-gray-900 dark:text-gray-100">Fallback</span>
    </label>
  </div>
</div>

<!-- Publication Cards Grid and Results (outside the white box) -->
<div class='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl mx-auto mt-8'>
  {#if loading && eventsInView.length === 0}
    <div class='flex justify-center items-center col-span-full py-8'>
      <Spinner size='sm' />
    </div>
  {:else if eventsInView.length > 0}
    {#each eventsInView as event (event.id)}
      <div class="flex flex-col h-full p-4 bg-white dark:bg-primary-900 rounded-lg border border-primary-200 dark:border-primary-800" aria-label="Publication card">
        {#if event.getTagValue('image')}
          <img src={event.getTagValue('image')} alt={event.getTagValue('title') || 'Publication cover'} class="w-full h-48 object-cover rounded mb-3" />
        {/if}
        <h2 class="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1 line-clamp-2">{event.getTagValue('title') || 'Untitled'}</h2>
        <div class="text-sm text-gray-700 dark:text-gray-300 mb-1">by {event.getTagValue('author') || 'unknown'}</div>
        <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">{event.getTagValue('published_on') || (event.created_at ? (new Date(event.created_at * 1000)).toLocaleDateString() : '')}</div>
        {#key event.id + '-type'}
          {@const typeVal = event.getTagValue('type')}
          {#if typeof typeVal === 'string' && typeVal}
            <div class="text-xs text-primary-800 dark:text-primary-200 mb-1">
              Type: {typeVal.charAt(0).toUpperCase() + typeVal.slice(1)}
            </div>
          {:else}
            <div class="text-xs text-primary-800 dark:text-primary-200 mb-1">
              Type: Book
            </div>
          {/if}
        {/key}
        {#if event.getTagValue('summary')}
          <div class="text-sm text-gray-800 dark:text-gray-200 mb-2">{event.getTagValue('summary')}</div>
        {/if}
        {#if event}
          <div class="flex flex-wrap gap-2 mt-4 w-full">
            {#each (typeof event.getTagValues === 'function' ? event.getTagValues('t') : []) as tag}
              <span class="px-2 py-1 rounded bg-primary-100 dark:bg-primary-800 text-primary-800 dark:text-primary-200 text-xs font-medium">#{tag}</span>
            {/each}
          </div>
        {/if}
      </div>
    {/each}
    {#if canLoadMore}
      <div class='flex justify-center mt-6 col-span-full'>
        <Button color='primary' class='rounded-lg px-6 py-2' on:click={() => getEvents(cutoffTimestamp, searchQuery, false)}>
          Load More
        </Button>
      </div>
    {/if}
  {:else if searchQuery.trim()}
    <div class='col-span-full'>
      <p class='text-center text-gray-900 dark:text-gray-100'>No publications found matching "{searchQuery}".</p>
    </div>
  {:else}
    <div class='col-span-full'>
      <p class='text-center text-gray-900 dark:text-gray-100'>No publications found.</p>
    </div>
  {/if}
</div>
