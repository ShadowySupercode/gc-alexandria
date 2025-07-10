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

  let loading = $state(false);
  let error = $state<string | null>(null);
  let searchValue = $state<string | null>(null);
  let dTagValue = $state<string | null>(null);
  let event = $state<NDKEvent | null>(null);
  let searchResults = $state<NDKEvent[]>([]);
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

  function handleSearchResults(results: NDKEvent[]) {
    searchResults = results;
    event = null;
    profile = null;
  }

  function handleClear() {
    goto('/events', { replaceState: true });
  }

  function getSummary(event: NDKEvent): string | undefined {
    return getMatchingTags(event, "summary")[0]?.[1];
  }

  function getDeferrelNaddr(event: NDKEvent): string | undefined {
    // Look for a 'deferrel' tag, e.g. ['deferrel', 'naddr1...']
    return getMatchingTags(event, "deferrel")[0]?.[1];
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

    {#if $isLoggedIn && !event && searchResults.length === 0}
      <EventInput />
    {/if}

    {#if event}
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
                {#if getDeferrelNaddr(result)}
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
                      {getDeferrelNaddr(result)}
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
