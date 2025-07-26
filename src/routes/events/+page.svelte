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
  import PaginatedEventResults from "$lib/components/PaginatedEventResults.svelte";
  import { userStore } from "$lib/stores/userStore";
  import { userBadge } from "$lib/snippets/UserSnippets.svelte";
  import { getMatchingTags, toNpub } from "$lib/utils/nostrUtils";
  import EventInput from "$lib/components/EventInput.svelte";
  import { userPubkey, isLoggedIn } from "$lib/stores/authStore.Svelte";
  import CopyToClipboard from "$lib/components/util/CopyToClipboard.svelte";
  import { neventEncode, naddrEncode } from "$lib/utils";
  import { activeInboxRelays, activeOutboxRelays } from "$lib/ndk";
  import { getEventType } from "$lib/utils/mime";
  import ViewPublicationLink from "$lib/components/util/ViewPublicationLink.svelte";
  import { checkCommunity } from "$lib/utils/search_utility";
  import { decodeSearchParams } from "$lib/utils/url_service";

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
  let searchError = $state<string | null>(null);
  let searchCompleted = $state(false);

  userStore.subscribe((val) => (user = val));

  function handleEventFound(newEvent: NDKEvent) {
    event = newEvent;
    showSidePanel = true;
    // Don't clear search results when showing a single event
    // This allows users to continue browsing results while viewing event details

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

  // Use the URL service to decode search parameters
  $effect(() => {
    const url = $page.url;
    const decodedParams = decodeSearchParams(url);
    
    searchValue = decodedParams.searchValue;
    dTagValue = decodedParams.dTagValue;
    searchType = decodedParams.searchType;
    searchTerm = decodedParams.searchTerm;
  });

  // Handle side panel visibility based on search type
  $effect(() => {
    const url = $page.url.searchParams;
    const hasIdParam = url.get("id");
    const hasDParam = url.get("d");
    const hasTParam = url.get("t");
    const hasNParam = url.get("n");
    const hasQParam = url.get("q");

    // Close side panel for searches that return multiple results
    if (hasDParam || hasTParam || hasNParam || hasQParam) {
      showSidePanel = false;
      event = null;
      profile = null;
    }
  });

  function handleSearchError(errorMessage: string) {
    searchError = errorMessage;
    searchCompleted = true;
    searchInProgress = false;
  }

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

    // Track when search completes with no results
    if (!loading && results.length === 0 && secondOrder.length === 0 && tTagEvents.length === 0) {
      searchCompleted = true;
      searchError = null; // Clear any previous errors
    } else if (results.length > 0 || secondOrder.length > 0 || tTagEvents.length > 0) {
      searchCompleted = true;
      searchError = null; // Clear any previous errors
    }

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
    } else if (secondOrder.length > 0 || searchCompleted) {
      // Clear message when second-order search completes (with or without results)
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
    // Reset all search-related state
    searchType = null;
    searchTerm = null;
    searchValue = null;
    dTagValue = null;
    searchResults = [];
    secondOrderResults = [];
    tTagResults = [];
    originalEventIds = new Set();
    originalAddresses = new Set();
    
    // Reset event and profile state
    event = null;
    profile = null;
    showSidePanel = false;
    
    // Reset search progress and messages
    searchInProgress = false;
    secondOrderSearchMessage = null;
    searchError = null;
    searchCompleted = false;
    
    // Reset loading and error states
    loading = false;
    error = null;
    
    // Reset community status
    communityStatus = {};
    
    // Navigate to clean events page
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

  function getNeventUrl(event: NDKEvent): string | null {
    if (event.kind === 0) {
      return neventEncode(event, $activeInboxRelays);
    }
    return neventEncode(event, $activeInboxRelays);
  }

  function getNaddrUrl(event: NDKEvent): string | null {
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

  function handlePageChange(page: number) {
    // This can be used for analytics or side effects if needed
    // For now, do nothing
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
    // Remove the logCurrentRelayConfiguration call since it's no longer available
    console.debug("[events/+page.svelte] Events page mounted");
  });

</script>

<div class="w-full flex justify-center">
  <div class="flex w-full max-w-7xl my-6 px-4 mx-auto gap-6 flex-col lg:flex-row">
    <!-- Left Panel: Search and Results -->
    <div class={showSidePanel ? "w-full lg:w-96 lg:min-w-96" : "w-full max-w-4xl mx-auto"}>
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
          onError={handleSearchError}
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
            <PaginatedEventResults
              events={searchResults}
              searchType={searchType}
              searchTerm={searchTerm || dTagValue?.toLowerCase() || null}
              onEventClick={handleEventFound}
              communityStatus={communityStatus}
              showPagination={true}
              onPageChange={handlePageChange}
            />
          </div>
        {/if}

        {#if secondOrderResults.length > 0}
          <div class="mt-8">
            <PaginatedEventResults
              events={secondOrderResults}
              searchType="reference"
              searchTerm="Second-Order Events (References, Replies, Quotes)"
              onEventClick={handleEventFound}
              communityStatus={communityStatus}
            />
            {#if (searchType === "n" || searchType === "d") && secondOrderResults.length === 100}
              <P class="mb-4 text-sm text-gray-600 dark:text-gray-400">
                Showing the 100 newest events. More results may be available.
              </P>
            {/if}
            <P class="mt-8 mb-4 text-sm text-gray-600 dark:text-gray-400 text-center">
              Events that reference, reply to, highlight, or quote the original
              events.
            </P>
          </div>
        {/if}

        {#if tTagResults.length > 0}
          <div class="mt-8">
            <PaginatedEventResults
              events={tTagResults}
              searchType="t"
              searchTerm={searchTerm || dTagValue?.toLowerCase() || null}
              onEventClick={handleEventFound}
              communityStatus={communityStatus}
            />
            <P class="mb-4 text-sm text-gray-600 dark:text-gray-400">
              Events that are tagged with the t-tag.
            </P>
          </div>
        {/if}

        {#if !event && searchResults.length === 0 && secondOrderResults.length === 0 && tTagResults.length === 0 && !searchValue && !dTagValue && !searchInProgress && !searchError && !searchCompleted}
          <div class="mt-8">
            <EventInput />
          </div>
        {/if}

        {#if searchError}
          <div class="mt-8 p-4 text-sm text-red-700 bg-red-100 dark:bg-red-900 dark:text-red-200 rounded-lg">
            <strong>Search Error:</strong> {searchError}
          </div>
        {/if}

        {#if searchCompleted && !searchError && searchResults.length === 0 && secondOrderResults.length === 0 && tTagResults.length === 0 && (searchValue || dTagValue)}
          <div class="mt-8 p-4 text-sm text-gray-700 bg-gray-100 dark:bg-gray-900 dark:text-gray-200 rounded-lg">
            <strong>No Results Found:</strong> No events or profiles were found matching your search criteria.
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
            {#if getNeventUrl(event)}
              <CopyToClipboard
                displayText={shortenAddress(getNeventUrl(event) || "")}
                copyText={getNeventUrl(event) || ""}
              />
            {/if}
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
