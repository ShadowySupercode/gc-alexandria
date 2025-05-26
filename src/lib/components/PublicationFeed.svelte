<script lang="ts">
  import { indexKind } from "$lib/consts";
  import { ndkInstance } from "$lib/ndk";
  import { filterValidIndexEvents } from "$lib/utils";
  import { Button, Spinner } from "flowbite-svelte";
  import SearchBar from "./SearchBar.svelte";
  import { onDestroy, onMount } from "svelte";
  import {
    isParentPublication,
    isTopLevelParent,
    type NDKEvent,
    NDKRelaySetFromNDK,
  } from "$lib/utils/nostrUtils";
  import { ensureNDKEvent } from "$lib/utils/relayGroupUtils";
  import PublicationHeader from "$components/cards/PublicationHeader.svelte";
  import { selectRelayGroup } from "$lib/utils/relayGroupUtils";
  import { relayGroup } from "$lib/stores/relayGroup";
  import { ndkSignedIn } from "$lib/ndk";

  let {
    searchQuery = "",
    useFallbackRelays = $bindable(true),
    fallbackRelays,
    isLoggedIn = false,
    userRelays,
  } = $props<{
    searchQuery?: string;
    useFallbackRelays?: boolean;
    userRelays: string[];
    fallbackRelays: string[];
    isLoggedIn?: boolean;
  }>();

  let eventsInView: NDKEvent[] = $state([]);
  let loadingMore: boolean = $state(false);
  let endOfFeed: boolean = $state(false);
  let relayStatuses = $state<Record<string, "pending" | "found" | "notfound">>(
    {},
  );
  let loading: boolean = $state(true);
  let isSearching = $state(false);
  let searchAbortController: AbortController | null = $state(null);
  let processedEvents = $state(0);
  let totalEvents = $state(0);
  let searchError = $state<{ message: string; code: string } | null>(null);
  let searchTimeout: number | null = $state(null);

  // Convert more state variables to derived values
  let isLoading = $derived.by(() => loading || loadingMore);
  let canLoadMore = $derived.by(() => !endOfFeed && !isLoading && !isSearching);
  let showSearchProgress = $derived.by(() => isSearching && totalEvents > 0);
  let searchProgressPercentage = $derived.by(() => {
    if (!showSearchProgress) return 0;
    return Math.round((processedEvents / totalEvents) * 100);
  });

  let cutoffTimestamp: number = $derived.by(
    () =>
      eventsInView?.at(eventsInView.length - 1)?.created_at ??
      new Date().getTime(),
  );

  // Convert searchProgress to a derived value
  let searchProgress = $derived.by(() => {
    if (!showSearchProgress) return null;
    return {
      processed: processedEvents,
      total: totalEvents,
      percentage: searchProgressPercentage,
    };
  });

  // Create a worker instance
  let searchWorker: Worker;
  let workerInitialized = false;
  let allEvents: NDKEvent[] = $state([]); // Store all events for autocomplete

  // Constants
  const CHUNK_SIZE = 100;
  const SEARCH_TIMEOUT = 30000; // 30 seconds timeout for search operations

  let showRelayDropdown = $state(false);

  let searchBarComponent;

  async function abortCurrentSearch() {
    if (searchAbortController) {
      searchAbortController.abort();
      searchAbortController = null;
    }
  }

  async function getEvents(
    before: number | undefined = undefined,
    search: string = "",
    reset: boolean = false,
    abortSignal?: AbortSignal,
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
            message: "Search operation timed out",
            code: "TIMEOUT",
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
    const primaryRelays: string[] = userRelays;
    const fallback: string[] = useFallbackRelays
      ? fallbackRelays.filter((r: string) => !primaryRelays.includes(r))
      : [];

    relayStatuses = Object.fromEntries([
      ...primaryRelays.map((r: string) => [r, "pending"]),
      ...fallback.map((r: string) => [r, "pending"]),
    ]);

    let fetchedCount = 0;

    // First, try primary relays
    let foundEventsInPrimary = false;
    const primaryResults = await Promise.allSettled(
      primaryRelays.map(async (relay: string) => {
        if (abortSignal?.aborted) return;

        try {
          const relaySet = NDKRelaySetFromNDK.fromRelayUrls([relay], ndk);
          let eventSet = await ndk
            .fetchEvents(
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
              relaySet,
            )
            .withTimeout(2500);

          if (abortSignal?.aborted) return;

          eventSet = filterValidIndexEvents(eventSet);
          const newEvents = Array.from(eventSet);
          allEvents = allEvents.concat(newEvents);
          allEvents = allEvents.filter(
            (event, index, self) =>
              index ===
              self.findIndex((e) => e.tagAddress() === event.tagAddress()),
          );

          if (eventSet.size > 0) {
            relayStatuses = { ...relayStatuses, [relay]: "found" };
            foundEventsInPrimary = true;
          } else {
            relayStatuses = { ...relayStatuses, [relay]: "notfound" };
          }
        } catch (err) {
          if (!abortSignal?.aborted) {
            console.error(`Error fetching from primary relay ${relay}:`, err);
            relayStatuses = { ...relayStatuses, [relay]: "notfound" };
          }
        }
      }),
    );

    // Only try fallback relays if no events were found in primary relays
    if (!foundEventsInPrimary && fallback.length > 0 && !abortSignal?.aborted) {
      await Promise.allSettled(
        fallback.map(async (relay: string) => {
          if (abortSignal?.aborted) return;

          try {
            const relaySet = NDKRelaySetFromNDK.fromRelayUrls([relay], ndk);
            let eventSet = await ndk
              .fetchEvents(
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
                relaySet,
              )
              .withTimeout(2500);

            if (abortSignal?.aborted) return;

            eventSet = filterValidIndexEvents(eventSet);
            const newEvents = Array.from(eventSet);
            allEvents = allEvents.concat(newEvents);
            allEvents = allEvents.filter(
              (event, index, self) =>
                index ===
                self.findIndex((e) => e.tagAddress() === event.tagAddress()),
            );

            if (eventSet.size > 0) {
              relayStatuses = { ...relayStatuses, [relay]: "found" };
            } else {
              relayStatuses = { ...relayStatuses, [relay]: "notfound" };
            }
          } catch (err) {
            if (!abortSignal?.aborted) {
              console.error(
                `Error fetching from fallback relay ${relay}:`,
                err,
              );
              relayStatuses = { ...relayStatuses, [relay]: "notfound" };
            }
          }
        }),
      );
    }

    // Use the worker to perform search if we have events and a search query
    if (workerInitialized && search) {
      searchWorker.postMessage({
        type: "SEARCH",
        events: allEvents.map((event) => event.rawEvent()),
        query: search,
        chunkSize: CHUNK_SIZE,
      });
    } else {
      // If no search or worker not initialized, just update the view
      const eventMap = new Map(
        [...eventsInView, ...allEvents].map((event) => [
          event.tagAddress(),
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
        return b.created_at! - a.created_at!;
      });
      eventsInView = uniqueEvents;
      loading = false;
    }

    // After updating eventsInView, ensure all are NDKEvent instances:
    eventsInView = eventsInView.map(ensureNDKEvent);

    const pageSize = fallback.length > 0 ? 18 : 30;
    endOfFeed = fetchedCount < pageSize;
  }

  onMount(() => {
    // Initialize the worker
    searchWorker = new Worker(
      new URL("../workers/searchWorker.ts", import.meta.url),
      { type: "module" },
    );
    workerInitialized = true;

    // Handle worker messages
    searchWorker.onmessage = (e: MessageEvent) => {
      const { type, results, progress, error: workerError } = e.data;

      switch (type) {
        case "SEARCH_RESULT":
          // Clear any existing timeout
          if (searchTimeout) {
            window.clearTimeout(searchTimeout);
            searchTimeout = null;
          }

          // Update the view with search results
          const eventMap = new Map(
            [...eventsInView, ...results].map((event) => [
              event.tagAddress(),
              event,
            ]),
          );
          const uniqueEvents = Array.from(eventMap.values()).sort((a, b) => {
            // First sort by hierarchy level (top-level parents first, then other parents, then children)
            const aIsTopLevel = isTopLevelParent(
              a,
              Array.from(eventMap.values()),
            );
            const bIsTopLevel = isTopLevelParent(
              b,
              Array.from(eventMap.values()),
            );
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
          allEvents = allEvents.filter(
            (event, index, self) =>
              index ===
              self.findIndex((e) => e.tagAddress() === event.tagAddress()),
          );

          loading = false;
          isSearching = false;
          searchProgress = null;
          searchError = null;
          break;

        case "SEARCH_PROGRESS":
          searchProgress = progress;
          break;

        case "SEARCH_ERROR":
          searchError = workerError;
          loading = false;
          isSearching = false;
          searchProgress = null;
          break;
      }
    };

    // Handle worker errors
    searchWorker.onerror = (error) => {
      console.error("Search worker error:", error);
      searchError = {
        message: "An error occurred in the search worker",
        code: "WORKER_ERROR",
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

  $effect(() => {
    getEvents(undefined, searchQuery, true);
  });
</script>

<!-- Controls White Box -->
<div class="mx-auto w-full max-w-3xl">
  <!-- Relay Group Selector -->
  <div class="mb-4 relative">
    <button
      type="button"
      class="inline-flex items-center px-4 py-2 bg-white dark:bg-brown-800 border border-brown-300 dark:border-brown-700 text-gray-900 dark:text-gray-100 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-brown-400 transition disabled:bg-gray-200 disabled:text-gray-400 disabled:border-gray-200 disabled:dark:bg-brown-900 disabled:dark:text-brown-400 disabled:dark:border-brown-800 disabled:cursor-not-allowed"
      onclick={() => (showRelayDropdown = !showRelayDropdown)}
      aria-haspopup="true"
      aria-expanded={showRelayDropdown}
      disabled={!$isLoggedIn}
      aria-label="Relay group selector"
    >
      <span class="font-medium text-gray-900 dark:text-gray-100">
        {$relayGroup === "community" ? "Community Relays" : "Your Relays"}
      </span>
      {#if $isLoggedIn}
        <svg
          class="ml-2 h-5 w-5 text- gray-900 dark:text-gray-100"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          ><path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M19 9l-7 7-7-7"
          /></svg
        >
      {/if}
    </button>
    {#if showRelayDropdown}
      <div
        class="origin-top-right absolute left-0 mt-2 w-64 rounded-lg shadow-lg bg-white dark:bg-brown-900 text-gray-900 dark:text-gray-100 ring-1 ring-black ring-opacity-5 z-10 border border-brown-300 dark:border-brown-700"
      >
        <div class="py-2">
          <label
            class="flex items-center px-4 py-2 cursor-pointer hover:bg-brown-100 dark:hover:bg-brown-800 text-gray-900 dark:text-gray-100"
          >
            <input
              type="radio"
              class="form-radio text-brown-700 focus:ring-brown-400 bg-white dark:bg-brown-800 border-brown-300 dark:border-brown-700"
              name="relayGroup"
              value="community"
              checked={$relayGroup === "community"}
              onchange={() => {
                relayGroup.set("community");
                showRelayDropdown = false;
              }}
              aria-label="Select Alexandria's Relays"
            />
            <span class="ml-3 text-gray-900 dark:text-gray-100"
              >Alexandria's Relays</span
            >
          </label>
          <label
            class="flex items-center px-4 py-2 cursor-pointer hover:bg-brown-100 dark:hover:bg-brown-800 text-gray-900 dark:text-gray-100"
          >
            <input
              type="radio"
              class="form-radio text-brown-700 focus:ring-brown-400 bg-white dark:bg-brown-800 border-brown-300 dark:border-brown-700"
              name="relayGroup"
              value="user"
              checked={$relayGroup === "user"}
              onchange={() => {
                relayGroup.set("user");
                showRelayDropdown = false;
              }}
              aria-label="Select Your Relays"
            />
            <span class="ml-3 text-gray-900 dark:text-gray-100"
              >Your Relays</span
            >
          </label>
        </div>
      </div>
    {/if}
  </div>

  <!-- Search Bar, Fallback Toggle, Search and Clear Buttons -->
  <SearchBar
    bind:this={searchBarComponent}
    placeholder="Search publications by title or author..."
    showFallbackToggle={true}
    bind:useFallbackRelays
    onDispatchSearch={async (query, useFallbackRelays) => {
      // await abortCurrentSearch();
      console.log(
        "Searching for:",
        query,
        "with fallback relays:",
        useFallbackRelays,
      );
      searchAbortController = new AbortController();
      isSearching = true;
      eventsInView = [];
      await getEvents(undefined, query, true, searchAbortController.signal);
      isSearching = false;
    }}
    onDispatchCancel={async () => {
      await abortCurrentSearch();
      isSearching = false;
    }}
    onDispatchClear={async () => {
      await abortCurrentSearch();
      isSearching = false;
      eventsInView = [];
      await getEvents(undefined, "", true);
    }}
  />
</div>

<!-- Publication Cards Grid and Results (outside the white box) -->
<div
  class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl mx-auto mt-8"
>
  {#if loading && eventsInView.length === 0}
    <div class="flex justify-center items-center col-span-full py-8">
      <Spinner size="sm" />
    </div>
  {:else if eventsInView.length > 0}
    {#each eventsInView as event (event.id)}
      <a href={"/publication?id=" + event.tagAddress()} class="block h-full">
        <PublicationHeader {event} />
      </a>
    {/each}
    {#if canLoadMore}
      <div class="flex justify-center mt-6 col-span-full">
        <Button
          color="primary"
          class="rounded-lg px-6 py-2"
          on:click={() => getEvents(cutoffTimestamp, searchQuery, false)}
        >
          Load More
        </Button>
      </div>
    {/if}
  {:else if searchQuery.trim()}
    <div class="col-span-full">
      <p class="text-center text-gray-900 dark:text-gray-100">
        No publications found matching "{searchQuery}".
      </p>
    </div>
  {:else}
    <div class="col-span-full">
      <p class="text-center text-gray-900 dark:text-gray-100">
        No publications found.
      </p>
    </div>
  {/if}
</div>
