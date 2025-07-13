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
  import { userBadge } from "$lib/snippets/UserSnippets.svelte";
  import { getMatchingTags, toNpub } from "$lib/utils/nostrUtils";
  import EventInput from '$lib/components/EventInput.svelte';
  import { userPubkey, isLoggedIn } from '$lib/stores/authStore';
  import RelayStatus from '$lib/components/RelayStatus.svelte';
  import { testAllRelays, logRelayDiagnostics } from '$lib/utils/relayDiagnostics';
  import CopyToClipboard from '$lib/components/util/CopyToClipboard.svelte';
  import { neventEncode, naddrEncode } from '$lib/utils';
  import { standardRelays } from '$lib/consts';
  import { getEventType } from '$lib/utils/mime';

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
  let userRelayPreference = $state(false);

  function handleEventFound(newEvent: NDKEvent) {
    event = newEvent;
    searchResults = [];
    secondOrderResults = [];
    tTagResults = [];
    originalEventIds = new Set();
    originalAddresses = new Set();
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

  function handleSearchResults(results: NDKEvent[], secondOrder: NDKEvent[] = [], tTagEvents: NDKEvent[] = [], eventIds: Set<string> = new Set(), addresses: Set<string> = new Set()) {
    searchResults = results;
    secondOrderResults = secondOrder;
    tTagResults = tTagEvents;
    originalEventIds = eventIds;
    originalAddresses = addresses;
    event = null;
    profile = null;
  }

  function handleClear() {
    goto('/events', { replaceState: true });
  }

  function getSummary(event: NDKEvent): string | undefined {
    return getMatchingTags(event, "summary")[0]?.[1];
  }

  function getDeferralNaddr(event: NDKEvent): string | undefined {
    // Look for a 'deferral' tag, e.g. ['deferral', 'naddr1...']
    return getMatchingTags(event, "deferral")[0]?.[1];
  }

  function getReferenceType(event: NDKEvent, originalEventIds: Set<string>, originalAddresses: Set<string>): string {
    // Check if this event has e-tags referencing original events
    const eTags = getMatchingTags(event, "e");
    for (const tag of eTags) {
      if (originalEventIds.has(tag[1])) {
        return "Reply/Reference (e-tag)";
      }
    }
    
    // Check if this event has a-tags referencing original events
    const aTags = getMatchingTags(event, "a");
    for (const tag of aTags) {
      if (originalAddresses.has(tag[1])) {
        return "Reply/Reference (a-tag)";
      }
    }
    
    // Check if this event has content references
    if (event.content) {
      for (const id of originalEventIds) {
        const neventPattern = new RegExp(`nevent1[a-z0-9]{50,}`, 'i');
        const notePattern = new RegExp(`note1[a-z0-9]{50,}`, 'i');
        if (neventPattern.test(event.content) || notePattern.test(event.content)) {
          return "Content Reference";
        }
      }
      
      for (const address of originalAddresses) {
        const naddrPattern = new RegExp(`naddr1[a-z0-9]{50,}`, 'i');
        if (naddrPattern.test(event.content)) {
          return "Content Reference";
        }
      }
    }
    
    return "Reference";
  }

  function getNeventAddress(event: NDKEvent): string {
    return neventEncode(event, standardRelays);
  }

  function isAddressableEvent(event: NDKEvent): boolean {
    return getEventType(event.kind || 0) === "addressable";
  }

  function getNaddrAddress(event: NDKEvent): string | null {
    if (!isAddressableEvent(event)) {
      return null;
    }
    try {
      return naddrEncode(event, standardRelays);
    } catch {
      return null;
    }
  }

  function shortenAddress(addr: string, head = 10, tail = 10): string {
    if (!addr || addr.length <= head + tail + 3) return addr;
    return addr.slice(0, head) + '…' + addr.slice(-tail);
  }

  function onLoadingChange(val: boolean) {
    loading = val;
  }

  $effect(() => {
    const id = $page.url.searchParams.get("id");
    const dTag = $page.url.searchParams.get("d");

    if (id !== searchValue) {
      searchValue = id;
      dTagValue = null;
    }

    if (dTag !== dTagValue) {
      // Normalize d-tag to lowercase for consistent searching
      dTagValue = dTag ? dTag.toLowerCase() : null;
      searchValue = null;
    }

    // Reset state if both id and dTag are absent
    if (!id && !dTag) {
      event = null;
      searchResults = [];
      profile = null;
    }
  });

  onMount(() => {
    // Initialize userPubkey from localStorage if available
    const pubkey = localStorage.getItem('userPubkey');
    userPubkey.set(pubkey);
    userRelayPreference = localStorage.getItem('useUserRelays') === 'true';
    
    // Run relay diagnostics to help identify connection issues
    testAllRelays().then(logRelayDiagnostics).catch(console.error);
  });
</script>

<div class="w-full flex justify-center">
  <main class="main-leather flex flex-col space-y-6 max-w-2xl w-full my-6 px-4">
    <div class="flex justify-between items-center">
      <Heading tag="h1" class="h-leather mb-2">Events</Heading>
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
      onLoadingChange={onLoadingChange}
    />

    {#if event}
      {#if event.kind !== 0}
        <div class="flex flex-col gap-2 mb-4 break-all">
          <CopyToClipboard
            displayText={shortenAddress(getNeventAddress(event))}
            copyText={getNeventAddress(event)}
          />
          {#if isAddressableEvent(event)}
            {@const naddrAddress = getNaddrAddress(event)}
            {#if naddrAddress}
              <CopyToClipboard
                displayText={shortenAddress(naddrAddress)}
                copyText={naddrAddress}
              />
            {/if}
          {/if}
        </div>
      {/if}
      <EventDetails {event} {profile} {searchValue} />
      <RelayActions {event} />
      {#if $isLoggedIn && $userPubkey}
        <div class="mt-8">
          <Heading tag="h2" class="h-leather mb-4">Add Comment</Heading>
          <CommentBox {event} {userRelayPreference} />
        </div>
      {:else}
        <div class="mt-8 p-4 bg-gray-200 dark:bg-gray-700 rounded-lg">
          <P>Please sign in to add comments.</P>
        </div>
      {/if}
    {/if}

    {#if searchResults.length > 0}
      <div class="mt-8">
        <Heading tag="h2" class="h-leather mb-4">
          Search Results for d-tag: "{dTagValue?.toLowerCase()}" ({searchResults.length}
          events)
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
                    >Event {index + 1}</span
                  >
                  <span class="text-xs text-gray-600 dark:text-gray-400"
                    >Kind: {result.kind}</span
                  >
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
                      ? new Date(result.created_at * 1000).toLocaleDateString()
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
                    <a
                      class="underline text-primary-700 dark:text-primary-400 hover:text-primary-900 dark:hover:text-primary-200 break-all"
                      href={"/publications?d=" +
                        encodeURIComponent((dTagValue || "").toLowerCase())}
                      onclick={(e) => e.stopPropagation()}
                      tabindex="0"
                    >
                      {getDeferralNaddr(result)}
                    </a>
                  </div>
                {/if}
                {#if result.content}
                  <div
                    class="text-sm text-gray-800 dark:text-gray-200 mt-1 line-clamp-2 break-words"
                  >
                    {result.content.slice(0, 200)}{result.content.length > 200
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
        <P class="mb-4 text-sm text-gray-600 dark:text-gray-400">
          Events that reference, reply to, highlight, or quote the original events.
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
                      ? new Date(result.created_at * 1000).toLocaleDateString()
                      : "Unknown date"}
                  </span>
                </div>
                <div class="text-xs text-blue-600 dark:text-blue-400 mb-1">
                  {getReferenceType(result, originalEventIds, originalAddresses)}
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
                    <a
                      class="underline text-primary-700 dark:text-primary-400 hover:text-primary-900 dark:hover:text-primary-200 break-all"
                      href={"/publications?d=" +
                        encodeURIComponent((dTagValue || "").toLowerCase())}
                      onclick={(e) => e.stopPropagation()}
                      tabindex="0"
                    >
                      {getDeferralNaddr(result)}
                    </a>
                  </div>
                {/if}
                {#if result.content}
                  <div
                    class="text-sm text-gray-800 dark:text-gray-200 mt-1 line-clamp-2 break-words"
                  >
                    {result.content.slice(0, 200)}{result.content.length > 200
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
          Search Results for t-tag: "{dTagValue?.toLowerCase()}" ({tTagResults.length}
          events)
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
                      ? new Date(result.created_at * 1000).toLocaleDateString()
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
                    <a
                      class="underline text-primary-700 dark:text-primary-400 hover:text-primary-900 dark:hover:text-primary-200 break-all"
                      href={"/publications?d=" +
                        encodeURIComponent((dTagValue || "").toLowerCase())}
                      onclick={(e) => e.stopPropagation()}
                      tabindex="0"
                    >
                      {getDeferralNaddr(result)}
                    </a>
                  </div>
                {/if}
                {#if result.content}
                  <div
                    class="text-sm text-gray-800 dark:text-gray-200 mt-1 line-clamp-2 break-words"
                  >
                    {result.content.slice(0, 200)}{result.content.length > 200
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
  </main>
</div>
