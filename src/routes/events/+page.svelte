<script lang="ts">
  import { Heading, P } from "flowbite-svelte";
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import type { NDKEvent } from "$lib/utils/nostrUtils";
  import EventSearch from "$lib/components/EventSearch.svelte";
  import EventDetails from "$lib/components/EventDetails.svelte";
  import RelayActions from "$lib/components/RelayActions.svelte";
  import CommentBox from "$lib/components/CommentBox.svelte";
  import { userStore } from "$lib/stores/userStore";
  import { userBadge } from "$lib/snippets/UserSnippets.svelte";
  import { getMatchingTags, toNpub } from "$lib/utils/nostrUtils";
  import EventInput from "$lib/components/EventInput.svelte";
  import { userPubkey, isLoggedIn } from "$lib/stores/authStore.Svelte";
  import CopyToClipboard from "$lib/components/util/CopyToClipboard.svelte";
  import { neventEncode, naddrEncode } from "$lib/utils";
  import { activeInboxRelays, activeOutboxRelays, logCurrentRelayConfiguration } from "$lib/ndk";
  import { getEventType } from "$lib/utils/mime";
  import ViewPublicationLink from "$lib/components/util/ViewPublicationLink.svelte";
  import { checkCommunity } from "$lib/utils/search_utility";

  let loading = $state(false);
  let error = $state<string | null>(null);
  let searchValue = $state<string | null>(null);
  let dTagValue = $state<string | null>(null);
  let event = $state<NDKEvent | null>(null);
  let searchResults = $state<NDKEvent[]>([]);
  let secondOrderResults = $state<NDKEvent[]>([]);
  let tTagResults = $state<NDKEvent[]>([]);
  let originalEventIds = $state<Set<string>>(new Set());
  let originalAddresses = $state<Set<string>>(new Set());
  let searchType = $state<string | null>(null);
  let searchTerm = $state<string | null>(null);
  let profile = $state<{
    name?: string;
    display_name?: string;
    about?: string;
    picture?: string;
    banner?: string;
    website?: string;
    lud16?: string;
    nip05?: string;
  } | null>(null);
  let user = $state($userStore);
  let userRelayPreference = $state(false);
  let showSidePanel = $state(false);
  let searchInProgress = $state(false);
  let secondOrderSearchMessage = $state<string | null>(null);
  let communityStatus = $state<Record<string, boolean>>({});

  userStore.subscribe((val) => (user = val));

  function handleEventFound(newEvent: NDKEvent) {
    event = newEvent;
    showSidePanel = true;
    // Clear search results when showing a single event
    searchResults = [];
    secondOrderResults = [];
    tTagResults = [];
    originalEventIds = new Set();
    originalAddresses = new Set();
    searchType = null;
    searchTerm = null;
    searchInProgress = false;
    secondOrderSearchMessage = null;

    if (newEvent.kind === 0) {
      try {
        profile = JSON.parse(newEvent.content);
      } catch {
        profile = null;
      }
    } else {
      profile = null;
    }
  }

  // Use Svelte 5 idiomatic effect to update searchValue when $page.url.searchParams.get('id') changes
  $effect(() => {
    const url = $page.url.searchParams;
    const idParam = url.get("id");
    const dParam = url.get("d");
    
    if (idParam) {
      searchValue = idParam;
      dTagValue = null;
    } else if (dParam) {
      searchValue = null;
      dTagValue = dParam.toLowerCase();
    } else {
      searchValue = null;
      dTagValue = null;
    }
  });

  // Add support for t and n parameters
  $effect(() => {
    const url = $page.url.searchParams;
    const tParam = url.get("t");
    const nParam = url.get("n");

    if (tParam) {
      // Decode the t parameter and set it as searchValue with t: prefix
      const decodedT = decodeURIComponent(tParam);
      searchValue = `t:${decodedT}`;
      dTagValue = null;
    } else if (nParam) {
      // Decode the n parameter and set it as searchValue with n: prefix
      const decodedN = decodeURIComponent(nParam);
      searchValue = `n:${decodedN}`;
      dTagValue = null;
    }
  });

  // Handle side panel visibility based on search type
  $effect(() => {
    const url = $page.url.searchParams;
    const hasIdParam = url.get("id");
    const hasDParam = url.get("d");
    const hasTParam = url.get("t");
    const hasNParam = url.get("n");

    // Close side panel for searches that return multiple results
    if (hasDParam || hasTParam || hasNParam) {
      showSidePanel = false;
      event = null;
      profile = null;
    }
  });

  function handleSearchResults(
    results: NDKEvent[],
    secondOrder: NDKEvent[] = [],
    tTagEvents: NDKEvent[] = [],
    eventIds: Set<string> = new Set(),
    addresses: Set<string> = new Set(),
    searchTypeParam?: string,
    searchTermParam?: string,
  ) {
    searchResults = results;
    secondOrderResults = secondOrder;
    tTagResults = tTagEvents;
    originalEventIds = eventIds;
    originalAddresses = addresses;
    searchType = searchTypeParam || null;
    searchTerm = searchTermParam || null;

    // Track search progress
    searchInProgress =
      loading || (results.length > 0 && secondOrder.length === 0);

    // Show second-order search message when we have first-order results but no second-order yet
    if (
      results.length > 0 &&
      secondOrder.length === 0 &&
      searchTypeParam === "n"
    ) {
      secondOrderSearchMessage = `Found ${results.length} profile(s). Starting second-order search for events mentioning these profiles...`;
    } else if (
      results.length > 0 &&
      secondOrder.length === 0 &&
      searchTypeParam === "d"
    ) {
      secondOrderSearchMessage = `Found ${results.length} event(s). Starting second-order search for events referencing these events...`;
    } else if (secondOrder.length > 0) {
      secondOrderSearchMessage = null;
    }

    // Check community status for all search results
    if (results.length > 0) {
      checkCommunityStatusForResults(results);
    }
    if (secondOrder.length > 0) {
      checkCommunityStatusForResults(secondOrder);
    }
    if (tTagEvents.length > 0) {
      checkCommunityStatusForResults(tTagEvents);
    }

    // Don't clear the current event - let the user continue viewing it
    // event = null;
    // profile = null;
  }

  function handleClear() {
    searchType = null;
    searchTerm = null;
    searchResults = [];
    secondOrderResults = [];
    tTagResults = [];
    originalEventIds = new Set();
    originalAddresses = new Set();
    event = null;
    profile = null;
    showSidePanel = false;
    searchInProgress = false;
    secondOrderSearchMessage = null;
    communityStatus = {};
    goto("/events", { replaceState: true });
  }

  function closeSidePanel() {
    showSidePanel = false;
    event = null;
    profile = null;
    searchInProgress = false;
    secondOrderSearchMessage = null;
  }

  function navigateToPublication(dTag: string) {
    goto(`/publications?d=${encodeURIComponent(dTag.toLowerCase())}`);
  }

  function getSummary(event: NDKEvent): string | undefined {
    return getMatchingTags(event, "summary")[0]?.[1];
  }

  function getDeferralNaddr(event: NDKEvent): string | undefined {
    // Look for a 'deferral' tag, e.g. ['deferral', 'naddr1...']
    return getMatchingTags(event, "deferral")[0]?.[1];
  }

  function getReferenceType(
    event: NDKEvent,
    originalEventIds: Set<string>,
    originalAddresses: Set<string>,
  ): string {
    // Check if this event has e-tags referencing original events
    const eTags = getMatchingTags(event, "e");
    for (const tag of eTags) {
      if (originalEventIds.has(tag[1])) {
        return "Reply/Reference (e-tag)";
      }
    }

    // Check if this event has a-tags or e-tags referencing original events
    let tags = getMatchingTags(event, "a");
    if (tags.length === 0) {
      tags = getMatchingTags(event, "e");
    }

    for (const tag of tags) {
      if (originalAddresses.has(tag[1])) {
        return "Reply/Reference (a-tag)";
      }
    }

    // Check if this event has content references
    if (event.content) {
      for (const id of originalEventIds) {
        const neventPattern = new RegExp(`nevent1[a-z0-9]{50,}`, "i");
        const notePattern = new RegExp(`note1[a-z0-9]{50,}`, "i");
        if (
          neventPattern.test(event.content) ||
          notePattern.test(event.content)
        ) {
          return "Content Reference";
        }
      }

      for (const address of originalAddresses) {
        const naddrPattern = new RegExp(`naddr1[a-z0-9]{50,}`, "i");
        if (naddrPattern.test(event.content)) {
          return "Content Reference";
        }
      }
    }

    return "Reference";
  }

  function getNeventUrl(event: NDKEvent): string {
    if (event.kind === 0) {
      return neventEncode(event, $activeInboxRelays);
    }
    return neventEncode(event, $activeInboxRelays);
  }

  function getNaddrUrl(event: NDKEvent): string {
    return naddrEncode(event, $activeInboxRelays);
  }

  function isAddressableEvent(event: NDKEvent): boolean {
    return getEventType(event.kind || 0) === "addressable";
  }

  function getNaddrAddress(event: NDKEvent): string | null {
    if (!isAddressableEvent(event)) {
      return null;
    }
    try {
      return naddrEncode(event, $activeInboxRelays);
    } catch {
      return null;
    }
  }

  function getViewPublicationNaddr(event: NDKEvent): string | null {
    // For deferred events, use the deferral naddr instead of the event's own naddr
    const deferralNaddr = getDeferralNaddr(event);
    if (deferralNaddr) {
      return deferralNaddr;
    }

    // Otherwise, use the event's own naddr if it's addressable
    return getNaddrAddress(event);
  }

  function shortenAddress(addr: string, head = 10, tail = 10): string {
    if (!addr || addr.length <= head + tail + 3) return addr;
    return addr.slice(0, head) + "…" + addr.slice(-tail);
  }

  function onLoadingChange(val: boolean) {
    loading = val;
    searchInProgress =
      val || (searchResults.length > 0 && secondOrderResults.length === 0);
  }

  /**
   * Check community status for all search results
   */
  async function checkCommunityStatusForResults(events: NDKEvent[]) {
    const newCommunityStatus: Record<string, boolean> = {};

    for (const event of events) {
      if (event.pubkey && !communityStatus[event.pubkey]) {
        try {
          newCommunityStatus[event.pubkey] = await checkCommunity(event.pubkey);
        } catch (error) {
          console.error(
            "Error checking community status for",
            event.pubkey,
            error,
          );
          newCommunityStatus[event.pubkey] = false;
        }
      } else if (event.pubkey) {
        newCommunityStatus[event.pubkey] = communityStatus[event.pubkey];
      }
    }

    communityStatus = { ...communityStatus, ...newCommunityStatus };
  }



  // Log relay configuration when page mounts
  onMount(() => {
    logCurrentRelayConfiguration();
  });

</script>

<div class="w-full flex justify-center">
  <div class="flex flex-col lg:flex-row w-full max-w-7xl my-6 px-4 mx-auto gap-6">
    <!-- Left Panel: Search and Results -->
    <div class={showSidePanel ? "w-full lg:w-80 lg:min-w-80" : "flex-1 max-w-4xl mx-auto"}>
      <div class="main-leather flex flex-col space-y-6">
        <div class="flex justify-between items-center">
          <Heading tag="h1" class="h-leather mb-2">Events</Heading>
          {#if showSidePanel}
            <button
              class="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              onclick={closeSidePanel}
            >
              Close Details
            </button>
          {/if}
        </div>

        <P class="mb-3">
          Use this page to view any event (npub, nprofile, nevent, naddr, note,
          pubkey, or eventID). You can also search for events by d-tag using the
          format "d:tag-name".
        </P>

        <EventSearch
          {loading}
          {error}
          {searchValue}
          {dTagValue}
          {event}
          onEventFound={handleEventFound}
          onSearchResults={handleSearchResults}
          onClear={handleClear}
          {onLoadingChange}
        />

        {#if secondOrderSearchMessage}
          <div
            class="mt-4 p-4 text-sm text-blue-700 bg-blue-100 dark:bg-blue-900 dark:text-blue-200 rounded-lg"
          >
            {secondOrderSearchMessage}
          </div>
        {/if}

        {#if searchResults.length > 0}
          <div class="mt-8">
            <Heading tag="h2" class="h-leather mb-4">
              {#if searchType === "n"}
                Search Results for name: "{searchTerm}" ({searchResults.length} profiles)
              {:else if searchType === "t"}
                Search Results for t-tag: "{searchTerm}" ({searchResults.length}
                events)
              {:else}
                Search Results for d-tag: "{searchTerm ||
                  dTagValue?.toLowerCase()}" ({searchResults.length} events)
              {/if}
            </Heading>
            <div class="space-y-4">
              {#each searchResults as result, index}
                <button
                  class="w-full text-left border border-gray-300 dark:border-gray-600 rounded-lg p-4 bg-white dark:bg-primary-900/70 hover:bg-gray-100 dark:hover:bg-primary-800 focus:bg-gray-100 dark:focus:bg-primary-800 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors overflow-hidden"
                  onclick={() => handleEventFound(result)}
                >
                  <div class="flex flex-col gap-1">
                    <div class="flex items-center gap-2 mb-1">
                      <span class="font-medium text-gray-800 dark:text-gray-100"
                        >{searchType === "n" ? "Profile" : "Event"}
                        {index + 1}</span
                      >
                      <span class="text-xs text-gray-600 dark:text-gray-400"
                        >Kind: {result.kind}</span
                      >
                      {#if result.pubkey && communityStatus[result.pubkey]}
                        <div
                          class="flex-shrink-0 w-4 h-4 bg-yellow-100 dark:bg-yellow-900 rounded-full flex items-center justify-center"
                          title="Has posted to the community"
                        >
                          <svg
                            class="w-3 h-3 text-yellow-600 dark:text-yellow-400"
                            fill="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                            />
                          </svg>
                        </div>
                      {:else}
                        <div class="flex-shrink-0 w-4 h-4"></div>
                      {/if}
                      <span class="text-xs text-gray-600 dark:text-gray-400">
                        {@render userBadge(
                          toNpub(result.pubkey) as string,
                          undefined,
                        )}
                      </span>
                      <span
                        class="text-xs text-gray-500 dark:text-gray-400 ml-auto"
                      >
                        {result.created_at
                          ? new Date(
                              result.created_at * 1000,
                            ).toLocaleDateString()
                          : "Unknown date"}
                      </span>
                    </div>
                    {#if getSummary(result)}
                      <div
                        class="text-sm text-primary-900 dark:text-primary-200 mb-1 line-clamp-2"
                      >
                        {getSummary(result)}
                      </div>
                    {/if}
                    {#if getDeferralNaddr(result)}
                      <div
                        class="text-xs text-primary-800 dark:text-primary-300 mb-1"
                      >
                        Read
                        <span
                          class="underline text-primary-700 dark:text-primary-400 hover:text-primary-900 dark:hover:text-primary-200 break-all cursor-pointer"
                          onclick={(e) => {
                            e.stopPropagation();
                            navigateToPublication(
                              getDeferralNaddr(result) || "",
                            );
                          }}
                          onkeydown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              e.stopPropagation();
                              navigateToPublication(
                                getDeferralNaddr(result) || "",
                              );
                            }
                          }}
                          tabindex="0"
                          role="button"
                        >
                          {getDeferralNaddr(result)}
                        </span>
                      </div>
                    {/if}
                    {#if isAddressableEvent(result)}
                      <div
                        class="text-xs text-blue-600 dark:text-blue-400 mb-1"
                      >
                        <ViewPublicationLink event={result} />
                      </div>
                    {/if}
                    {#if result.content}
                      <div
                        class="text-sm text-gray-800 dark:text-gray-200 mt-1 line-clamp-2 break-words"
                      >
                        {result.content.slice(0, 200)}{result.content.length >
                        200
                          ? "..."
                          : ""}
                      </div>
                    {/if}
                  </div>
                </button>
              {/each}
            </div>
          </div>
        {/if}

        {#if secondOrderResults.length > 0}
          <div class="mt-8">
            <Heading tag="h2" class="h-leather mb-4">
              Second-Order Events (References, Replies, Quotes) ({secondOrderResults.length}
              events)
            </Heading>
            {#if (searchType === "n" || searchType === "d") && secondOrderResults.length === 100}
              <P class="mb-4 text-sm text-gray-600 dark:text-gray-400">
                Showing the 100 newest events. More results may be available.
              </P>
            {/if}
            <P class="mb-4 text-sm text-gray-600 dark:text-gray-400">
              Events that reference, reply to, highlight, or quote the original
              events.
            </P>
            <div class="space-y-4">
              {#each secondOrderResults as result, index}
                <button
                  class="w-full text-left border border-gray-300 dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-primary-800/50 hover:bg-gray-100 dark:hover:bg-primary-700 focus:bg-gray-100 dark:focus:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors overflow-hidden"
                  onclick={() => handleEventFound(result)}
                >
                  <div class="flex flex-col gap-1">
                    <div class="flex items-center gap-2 mb-1">
                      <span class="font-medium text-gray-800 dark:text-gray-100"
                        >Reference {index + 1}</span
                      >
                      <span class="text-xs text-gray-600 dark:text-gray-400"
                        >Kind: {result.kind}</span
                      >
                      {#if result.pubkey && communityStatus[result.pubkey]}
                        <div
                          class="flex-shrink-0 w-4 h-4 bg-yellow-100 dark:bg-yellow-900 rounded-full flex items-center justify-center"
                          title="Has posted to the community"
                        >
                          <svg
                            class="w-3 h-3 text-yellow-600 dark:text-yellow-400"
                            fill="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                            />
                          </svg>
                        </div>
                      {:else}
                        <div class="flex-shrink-0 w-4 h-4"></div>
                      {/if}
                      <span class="text-xs text-gray-600 dark:text-gray-400">
                        {@render userBadge(
                          toNpub(result.pubkey) as string,
                          undefined,
                        )}
                      </span>
                      <span
                        class="text-xs text-gray-500 dark:text-gray-400 ml-auto"
                      >
                        {result.created_at
                          ? new Date(
                              result.created_at * 1000,
                            ).toLocaleDateString()
                          : "Unknown date"}
                      </span>
                    </div>
                    <div class="text-xs text-blue-600 dark:text-blue-400 mb-1">
                      {getReferenceType(
                        result,
                        originalEventIds,
                        originalAddresses,
                      )}
                    </div>
                    {#if getSummary(result)}
                      <div
                        class="text-sm text-primary-900 dark:text-primary-200 mb-1 line-clamp-2"
                      >
                        {getSummary(result)}
                      </div>
                    {/if}
                    {#if getDeferralNaddr(result)}
                      <div
                        class="text-xs text-primary-800 dark:text-primary-300 mb-1"
                      >
                        Read
                        <span
                          class="underline text-primary-700 dark:text-primary-400 hover:text-primary-900 dark:hover:text-primary-200 break-all cursor-pointer"
                          onclick={(e) => {
                            e.stopPropagation();
                            navigateToPublication(
                              getDeferralNaddr(result) || "",
                            );
                          }}
                          onkeydown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              e.stopPropagation();
                              navigateToPublication(
                                getDeferralNaddr(result) || "",
                              );
                            }
                          }}
                          tabindex="0"
                          role="button"
                        >
                          {getDeferralNaddr(result)}
                        </span>
                      </div>
                    {/if}
                    {#if isAddressableEvent(result)}
                      <div
                        class="text-xs text-blue-600 dark:text-blue-400 mb-1"
                      >
                        <ViewPublicationLink event={result} />
                      </div>
                    {/if}
                    {#if result.content}
                      <div
                        class="text-sm text-gray-800 dark:text-gray-200 mt-1 line-clamp-2 break-words"
                      >
                        {result.content.slice(0, 200)}{result.content.length >
                        200
                          ? "..."
                          : ""}
                      </div>
                    {/if}
                  </div>
                </button>
              {/each}
            </div>
          </div>
        {/if}

        {#if tTagResults.length > 0}
          <div class="mt-8">
            <Heading tag="h2" class="h-leather mb-4">
              Search Results for t-tag: "{searchTerm ||
                dTagValue?.toLowerCase()}" ({tTagResults.length} events)
            </Heading>
            <P class="mb-4 text-sm text-gray-600 dark:text-gray-400">
              Events that are tagged with the t-tag.
            </P>
            <div class="space-y-4">
              {#each tTagResults as result, index}
                <button
                  class="w-full text-left border border-gray-300 dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-primary-800/50 hover:bg-gray-100 dark:hover:bg-primary-700 focus:bg-gray-100 dark:focus:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors overflow-hidden"
                  onclick={() => handleEventFound(result)}
                >
                  <div class="flex flex-col gap-1">
                    <div class="flex items-center gap-2 mb-1">
                      <span class="font-medium text-gray-800 dark:text-gray-100"
                        >Tagged Event {index + 1}</span
                      >
                      <span class="text-xs text-gray-600 dark:text-gray-400"
                        >Kind: {result.kind}</span
                      >
                      {#if result.pubkey && communityStatus[result.pubkey]}
                        <div
                          class="flex-shrink-0 w-4 h-4 bg-yellow-100 dark:bg-yellow-900 rounded-full flex items-center justify-center"
                          title="Has posted to the community"
                        >
                          <svg
                            class="w-3 h-3 text-yellow-600 dark:text-yellow-400"
                            fill="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                            />
                          </svg>
                        </div>
                      {:else}
                        <div class="flex-shrink-0 w-4 h-4"></div>
                      {/if}
                      <span class="text-xs text-gray-600 dark:text-gray-400">
                        {@render userBadge(
                          toNpub(result.pubkey) as string,
                          undefined,
                        )}
                      </span>
                      <span
                        class="text-xs text-gray-500 dark:text-gray-400 ml-auto"
                      >
                        {result.created_at
                          ? new Date(
                              result.created_at * 1000,
                            ).toLocaleDateString()
                          : "Unknown date"}
                      </span>
                    </div>
                    {#if getSummary(result)}
                      <div
                        class="text-sm text-primary-900 dark:text-primary-200 mb-1 line-clamp-2"
                      >
                        {getSummary(result)}
                      </div>
                    {/if}
                    {#if getDeferralNaddr(result)}
                      <div
                        class="text-xs text-primary-800 dark:text-primary-300 mb-1"
                      >
                        Read
                        <span
                          class="underline text-primary-700 dark:text-primary-400 hover:text-primary-900 dark:hover:text-primary-200 break-all cursor-pointer"
                          onclick={(e) => {
                            e.stopPropagation();
                            navigateToPublication(
                              getDeferralNaddr(result) || "",
                            );
                          }}
                          onkeydown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              e.stopPropagation();
                              navigateToPublication(
                                getDeferralNaddr(result) || "",
                              );
                            }
                          }}
                          tabindex="0"
                          role="button"
                        >
                          {getDeferralNaddr(result)}
                        </span>
                      </div>
                    {/if}
                    {#if isAddressableEvent(result)}
                      <div
                        class="text-xs text-blue-600 dark:text-blue-400 mb-1"
                      >
                        <ViewPublicationLink event={result} />
                      </div>
                    {/if}
                    {#if result.content}
                      <div
                        class="text-sm text-gray-800 dark:text-gray-200 mt-1 line-clamp-2 break-words"
                      >
                        {result.content.slice(0, 200)}{result.content.length >
                        200
                          ? "..."
                          : ""}
                      </div>
                    {/if}
                  </div>
                </button>
              {/each}
            </div>
          </div>
        {/if}

        {#if !event && searchResults.length === 0 && secondOrderResults.length === 0 && tTagResults.length === 0 && !searchValue && !dTagValue && !searchInProgress}
          <div class="mt-8">
            <EventInput />
          </div>
        {/if}
      </div>
    </div>

    <!-- Right Panel: Event Details -->
    {#if showSidePanel && event}
      <div class="w-full lg:flex-1 lg:min-w-0 main-leather flex flex-col space-y-6">
        <div class="flex justify-between items-center">
          <Heading tag="h2" class="h-leather mb-2">Event Details</Heading>
          <button
            class="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
            onclick={closeSidePanel}
          >
            ✕
          </button>
        </div>

        {#if event.kind !== 0}
          <div class="flex flex-col gap-2 mb-4 break-all">
            <CopyToClipboard
              displayText={shortenAddress(getNeventUrl(event))}
              copyText={getNeventUrl(event)}
            />
            {#if isAddressableEvent(event)}
              {@const naddrAddress = getViewPublicationNaddr(event)}
              {#if naddrAddress}
                <CopyToClipboard
                  displayText={shortenAddress(naddrAddress)}
                  copyText={naddrAddress}
                />
                <div class="mt-2">
                  <ViewPublicationLink {event} />
                </div>
              {/if}
            {/if}
          </div>
        {/if}

        <EventDetails {event} {profile} {searchValue} />
        <RelayActions {event} />

        {#if isLoggedIn && userPubkey}
          <div class="mt-8">
            <Heading tag="h3" class="h-leather mb-4">Add Comment</Heading>
            <CommentBox {event} {userRelayPreference} />
          </div>
        {:else}
          <div class="mt-8 p-4 bg-gray-200 dark:bg-gray-700 rounded-lg">
            <P>Please sign in to add comments.</P>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>
