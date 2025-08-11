<script lang="ts">
  import { Heading, P } from "flowbite-svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import type { NDKEvent } from "$lib/utils/nostrUtils";
  import EventSearch from "$lib/components/EventSearch.svelte";
  import EventDetails from "$lib/components/EventDetails.svelte";
  import RelayActions from "$lib/components/RelayActions.svelte";
  import CommentBox from "$lib/components/CommentBox.svelte";
  import CommentViewer from "$lib/components/CommentViewer.svelte";
  import { userStore } from "$lib/nostr/utils/auth/auth_store";
  import { userBadge } from "$lib/snippets/UserSnippets.svelte";
  import { getMatchingTags, toNpub, getUserMetadata } from "$lib/utils/nostrUtils";
  import EventInput from "$lib/components/EventInput.svelte";
  import { userPubkey, isLoggedIn } from "$lib/stores/authStore.svelte";
  import CopyToClipboard from "$lib/components/util/CopyToClipboard.svelte";
  import { neventEncode, naddrEncode } from "$lib/utils";
  import { activeInboxRelays, activeOutboxRelays } from "$lib/ndk";
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
    
    // AI-NOTE: 2025-01-24 - Ensure profile is cached for the event author
    if (newEvent.pubkey) {
      cacheProfileForPubkey(newEvent.pubkey);
    }
  }

  // AI-NOTE: 2025-01-24 - Function to ensure profile is cached for a pubkey
  async function cacheProfileForPubkey(pubkey: string) {
    try {
      const npub = toNpub(pubkey);
      if (npub) {
        // Force fetch to ensure profile is cached
        await getUserMetadata(npub, true);
        console.log(`[Events Page] Cached profile for pubkey: ${pubkey}`);
      }
    } catch (error) {
      console.warn(`[Events Page] Failed to cache profile for ${pubkey}:`, error);
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

    // AI-NOTE: 2025-01-08 - Only show second-order search message if we're actually searching
    // Don't show it for cached results that have no second-order events
    if (
      results.length > 0 &&
      secondOrder.length === 0 &&
      searchTypeParam === "n" &&
      !loading // Only show message if we're actively searching, not for cached results
    ) {
      secondOrderSearchMessage = `Found ${results.length} profile(s). Starting second-order search for events mentioning these profiles...`;
    } else if (
      results.length > 0 &&
      secondOrder.length === 0 &&
      searchTypeParam === "d" &&
      !loading // Only show message if we're actively searching, not for cached results
    ) {
      secondOrderSearchMessage = `Found ${results.length} event(s). Starting second-order search for events referencing these events...`;
    } else if (secondOrder.length > 0) {
      secondOrderSearchMessage = null;
    } else {
      // Clear message if we have results but no second-order search is happening
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

    // AI-NOTE: 2025-01-24 - Cache profiles for all search results
    cacheProfilesForEvents([...results, ...secondOrder, ...tTagEvents]);

    // Don't clear the current event - let the user continue viewing it
    // event = null;
    // profile = null;
  }

  // AI-NOTE: 2025-01-24 - Function to cache profiles for multiple events
  async function cacheProfilesForEvents(events: NDKEvent[]) {
    const uniquePubkeys = new Set<string>();
    events.forEach(event => {
      if (event.pubkey) {
        uniquePubkeys.add(event.pubkey);
      }
    });
    
    console.log(`[Events Page] Caching profiles for ${uniquePubkeys.size} unique pubkeys`);
    
    // Cache profiles in parallel
    const cachePromises = Array.from(uniquePubkeys).map(pubkey => cacheProfileForPubkey(pubkey));
    await Promise.allSettled(cachePromises);
    
    console.log(`[Events Page] Profile caching complete`);
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
    const eTags = event.getMatchingTags("e");
    const aTags = event.getMatchingTags("a");

    if (eTags.length > 0) {
      const referencedEventId = eTags[eTags.length - 1][1];
      if (originalEventIds.has(referencedEventId)) {
        return "Reply";
      }
    }

    if (aTags.length > 0) {
      const referencedAddress = aTags[aTags.length - 1][1];
      if (originalAddresses.has(referencedAddress)) {
        return "Quote";
      }
    }

    return "Reference";
  }

  // AI-NOTE: 2025-01-24 - Function to parse profile content from kind 0 events
  function parseProfileContent(event: NDKEvent): {
    name?: string;
    display_name?: string;
    about?: string;
    picture?: string;
    banner?: string;
    website?: string;
    lud16?: string;
    nip05?: string;
  } | null {
    if (event.kind !== 0 || !event.content) {
      return null;
    }

    try {
      return JSON.parse(event.content);
    } catch (error) {
      console.warn("Failed to parse profile content:", error);
      return null;
    }
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



  // AI-NOTE: Refactored to avoid blocking $effect with logging operations
  // Reactive effect to log relay configuration when stores change - non-blocking approach
  $effect.pre(() => {
    const inboxRelays = $activeInboxRelays;
    const outboxRelays = $activeOutboxRelays;
    
    // Only log if we have relays (not empty arrays)
    if (inboxRelays.length > 0 || outboxRelays.length > 0) {
      // Defer logging to avoid blocking the reactive system
      requestAnimationFrame(() => {
        console.log('🔌 Events Page - Relay Configuration Updated:');
        console.log('📥 Inbox Relays:', inboxRelays);
        console.log('📤 Outbox Relays:', outboxRelays);
        console.log(`📊 Total: ${inboxRelays.length} inbox, ${outboxRelays.length} outbox`);
      });
    }
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
            <Heading tag="h2" class="h-leather mb-4 break-words">
              {#if searchType === "n"}
                Search Results for name: "{searchTerm && searchTerm.length > 50 ? searchTerm.slice(0, 50) + '...' : searchTerm || ''}" ({searchResults.length} profiles)
              {:else if searchType === "t"}
                Search Results for t-tag: "{searchTerm && searchTerm.length > 50 ? searchTerm.slice(0, 50) + '...' : searchTerm || ''}" ({searchResults.length}
                events)
              {:else}
                Search Results for d-tag: "{(() => {
                  const term = searchTerm || dTagValue?.toLowerCase() || '';
                  return term.length > 50 ? term.slice(0, 50) + '...' : term;
                })()}" ({searchResults.length} events)
              {/if}
            </Heading>
            <div class="space-y-4">
              {#each searchResults as result, index}
                {@const profileData = parseProfileContent(result)}
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
                          profileData?.display_name || profileData?.name,
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
                    {#if result.kind === 0 && profileData}
                      <div class="flex items-center gap-3 mb-2">
                        {#if profileData.picture}
                          <img
                            src={profileData.picture}
                            alt="Profile"
                            class="w-12 h-12 rounded-full object-cover border border-gray-200 dark:border-gray-600"
                            onerror={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        {:else}
                          <div class="w-12 h-12 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center border border-gray-200 dark:border-gray-600">
                            <span class="text-lg font-medium text-gray-600 dark:text-gray-300">
                              {(profileData.display_name || profileData.name || result.pubkey.slice(0, 1)).toUpperCase()}
                            </span>
                          </div>
                        {/if}
                        <div class="flex flex-col min-w-0 flex-1">
                          {#if profileData.display_name || profileData.name}
                            <span class="font-medium text-gray-900 dark:text-gray-100 truncate">
                              {profileData.display_name || profileData.name}
                            </span>
                          {/if}
                          {#if profileData.about}
                            <span class="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                              {profileData.about}
                            </span>
                          {/if}
                        </div>
                      </div>
                    {:else}
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
                {@const profileData = parseProfileContent(result)}
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
                          profileData?.display_name || profileData?.name,
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
                    {#if result.kind === 0 && profileData}
                      <div class="flex items-center gap-3 mb-2">
                        {#if profileData.picture}
                          <img
                            src={profileData.picture}
                            alt="Profile"
                            class="w-12 h-12 rounded-full object-cover border border-gray-200 dark:border-gray-600"
                            onerror={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        {:else}
                          <div class="w-12 h-12 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center border border-gray-200 dark:border-gray-600">
                            <span class="text-lg font-medium text-gray-600 dark:text-gray-300">
                              {(profileData.display_name || profileData.name || result.pubkey.slice(0, 1)).toUpperCase()}
                            </span>
                          </div>
                        {/if}
                        <div class="flex flex-col min-w-0 flex-1">
                          {#if profileData.display_name || profileData.name}
                            <span class="font-medium text-gray-900 dark:text-gray-100 truncate">
                              {profileData.display_name || profileData.name}
                            </span>
                          {/if}
                          {#if profileData.about}
                            <span class="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                              {profileData.about}
                            </span>
                          {/if}
                        </div>
                      </div>
                    {:else}
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
                {@const profileData = parseProfileContent(result)}
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
                          profileData?.display_name || profileData?.name,
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
                    {#if result.kind === 0 && profileData}
                      <div class="flex items-center gap-3 mb-2">
                        {#if profileData.picture}
                          <img
                            src={profileData.picture}
                            alt="Profile"
                            class="w-12 h-12 rounded-full object-cover border border-gray-200 dark:border-gray-600"
                            onerror={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        {:else}
                          <div class="w-12 h-12 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center border border-gray-200 dark:border-gray-600">
                            <span class="text-lg font-medium text-gray-600 dark:text-gray-300">
                              {(profileData.display_name || profileData.name || result.pubkey.slice(0, 1)).toUpperCase()}
                            </span>
                          </div>
                        {/if}
                        <div class="flex flex-col min-w-0 flex-1">
                          {#if profileData.display_name || profileData.name}
                            <span class="font-medium text-gray-900 dark:text-gray-100 truncate">
                              {profileData.display_name || profileData.name}
                            </span>
                          {/if}
                          {#if profileData.about}
                            <span class="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                              {profileData.about}
                            </span>
                          {/if}
                        </div>
                      </div>
                    {:else}
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

        <CommentViewer {event} />
        
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
