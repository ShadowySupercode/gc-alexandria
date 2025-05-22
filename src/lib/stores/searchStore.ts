import { writable, derived } from 'svelte/store';
import type { NDKEvent } from '$lib/utils/nostrUtils';
import { fallbackRelays } from '$lib/consts';

// Types
export type SearchState = {
  query: string;
  isSearching: boolean;
  error: { message: string; code: string } | null;
  progress: { processed: number; total: number; percentage: number } | null;
  useFallbackRelays: boolean;
  results: NDKEvent[];
  allEvents: NDKEvent[]; // Store all events for autocomplete
  suggestions: Array<{ text: string; type: 'title' | 'author' | 'tag'; score: number }>;
};

export type SearchFilters = Record<string, string>;

// Initial state
const initialState: SearchState = {
  query: '',
  isSearching: false,
  error: null,
  progress: null,
  useFallbackRelays: true,
  results: [],
  allEvents: [],
  suggestions: []
};

// Create the store
const createSearchStore = () => {
  const { subscribe, set, update } = writable<SearchState>(initialState);

  // Worker management
  let searchWorker: Worker | null = null;
  let workerInitialized = false;
  let searchTimeout: number | null = null;

  // Constants
  const CHUNK_SIZE = 100;
  const SEARCH_TIMEOUT = 30000; // 30 seconds timeout for search operations

  // Initialize search worker
  function initializeWorker() {
    if (!workerInitialized) {
      searchWorker = new Worker(new URL('../workers/searchWorker.ts', import.meta.url), { type: 'module' });
      workerInitialized = true;

      searchWorker.onmessage = (e: MessageEvent) => {
        const { type, results, progress, error, suggestions } = e.data;
        
        update(state => {
          switch (type) {
            case 'SEARCH_RESULT':
              return {
                ...state,
                results,
                isSearching: false,
                progress: null,
                error: null
              };
              
            case 'SEARCH_PROGRESS':
              return {
                ...state,
                progress
              };
              
            case 'SEARCH_ERROR':
              return {
                ...state,
                error,
                isSearching: false,
                progress: null
              };

            case 'AUTOCOMPLETE_RESULT':
              return {
                ...state,
                suggestions
              };

            default:
              return state;
          }
        });
      };

      searchWorker.onerror = (error) => {
        console.error('Search worker error:', error);
        update(state => ({
          ...state,
          error: {
            message: 'An error occurred in the search worker',
            code: 'WORKER_ERROR'
          },
          isSearching: false,
          progress: null
        }));
      };
    }
    return searchWorker;
  }

  // Cleanup worker
  function cleanupWorker() {
    if (workerInitialized && searchWorker) {
      searchWorker.terminate();
      searchWorker = null;
      workerInitialized = false;
    }
    if (searchTimeout) {
      clearTimeout(searchTimeout);
      searchTimeout = null;
    }
  }

  // Perform search
  async function search(events: NDKEvent[], query: string, filters: SearchFilters = {}) {
    if (!workerInitialized || !searchWorker) {
      throw new Error('Search worker not initialized');
    }

    update(state => ({
      ...state,
      isSearching: true,
      error: null,
      progress: null,
      query
    }));

    // Set timeout for search operation
    searchTimeout = window.setTimeout(() => {
      update(state => {
        if (state.isSearching) {
          return {
            ...state,
            error: {
              message: 'Search operation timed out',
              code: 'TIMEOUT'
            },
            isSearching: false,
            progress: null
          };
        }
        return state;
      });
    }, SEARCH_TIMEOUT);

    try {
      searchWorker.postMessage({
        type: 'SEARCH',
        events,
        query,
        filters,
        chunkSize: CHUNK_SIZE
      });

      // Update allEvents for autocomplete
      update(state => {
        const newEvents = [...state.allEvents, ...events];
        // Deduplicate events based on tagAddress
        const uniqueEvents = newEvents.filter((event, index, self) => 
          index === self.findIndex((e) => e.tagAddress() === event.tagAddress())
        );
        return { ...state, allEvents: uniqueEvents };
      });
    } catch (error) {
      update(state => ({
        ...state,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error during search',
          code: 'SEARCH_ERROR'
        },
        isSearching: false
      }));
    }
  }

  // Get autocomplete suggestions
  async function getSuggestions(query: string): Promise<void> {
    if (!workerInitialized || !searchWorker) {
      throw new Error('Search worker not initialized');
    }

    if (query.length < 2) {
      update(state => ({ ...state, suggestions: [] }));
      return;
    }

    return new Promise((resolve) => {
      const handler = (e: MessageEvent) => {
        const { type, suggestions } = e.data;
        if (type === 'AUTOCOMPLETE_RESULT') {
          searchWorker?.removeEventListener('message', handler);
          update(state => ({ ...state, suggestions }));
          resolve();
        }
      };

      searchWorker?.addEventListener('message', handler);
      searchWorker?.postMessage({
        type: 'AUTOCOMPLETE',
        events: get().allEvents,
        query,
        filters: {}
      });
    });
  }

  // Update events for autocomplete
  function updateEvents(events: NDKEvent[]) {
    update(state => {
      const newEvents = [...state.allEvents, ...events];
      // Deduplicate events based on tagAddress
      const uniqueEvents = newEvents.filter((event, index, self) => 
        index === self.findIndex((e) => e.tagAddress() === event.tagAddress())
      );
      return { ...state, allEvents: uniqueEvents };
    });
  }

  // Clear search
  function clearSearch() {
    update(state => ({
      ...state,
      query: '',
      results: [],
      suggestions: [],
      error: null,
      progress: null
    }));
  }

  // Toggle fallback relays
  function toggleFallbackRelays() {
    update(state => ({
      ...state,
      useFallbackRelays: !state.useFallbackRelays
    }));
  }

  // Get current state
  function get() {
    let state: SearchState;
    subscribe(s => state = s)();
    return state!;
  }

  return {
    subscribe,
    set,
    update,
    initializeWorker,
    cleanupWorker,
    search,
    getSuggestions,
    updateEvents,
    clearSearch,
    toggleFallbackRelays
  };
};

// Export the store instance
export const searchStore = createSearchStore();

// Derived store for filtered events
export const filteredEvents = derived(searchStore, $store => {
  if ($store.results.length > 0) {
    return $store.results;
  }
  return $store.allEvents;
}); 