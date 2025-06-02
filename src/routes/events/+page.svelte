<script lang="ts">
  import { Heading, P } from "flowbite-svelte";
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import type { NostrEvent } from '$lib/types/nostr';
  import type { NostrProfile } from '$lib/utils/types';
  import EventSearch from "$lib/components/EventSearch.svelte";
  import EventDetails from "$lib/components/EventDetails.svelte";
  import RelayActions from "$lib/components/RelayActions.svelte";
  import CommentBox from "$lib/components/CommentBox.svelte";
  import { selectRelayGroup } from '$lib/utils';

  // Define props
  let {
    address,
    publicationType,
    ref,
  }: {
    address: string,
    publicationType: string,
    ref: (ref: HTMLElement) => void,
  } = $props();

  // Component state using runes
  let loading = $state(false);
  let error = $state<string | null>(null);
  let searchValue = $state<string | null>(null);
  let event = $state<NostrEvent | null>(null);
  let profile = $state<NostrProfile | null>(null);
  let userPubkey = $state<string | null>(null);
  let searchTerm = $state("");

  // Derived state
  let urlSearchTerm = $derived($page.url.searchParams.get("id") || "");
  let userRelayPreference = $derived.by(() => {
    const useUserRelays = localStorage.getItem("useUserRelays") === "true";
    return useUserRelays ? selectRelayGroup('inbox') : [];
  });

  // Effects
  $effect(() => {
    if (urlSearchTerm) {
      searchValue = urlSearchTerm;
      error = null;
      loading = true;
    }
  });

  // Callback props
  let handleEventFound = (newEvent: NostrEvent) => {
    event = newEvent;
    loading = false;
    if (newEvent.kind === 0) {
      try {
        profile = JSON.parse(newEvent.content);
      } catch {
        profile = null;
      }
    } else {
      profile = null;
    }
  };

  let onSubmit = () => {
    if (searchTerm.trim()) {
      searchValue = searchTerm.trim();
      error = null;
      loading = true;
    }
  };

  // Lifecycle hooks
  onMount(() => {
    userPubkey = localStorage.getItem("userPubkey");
  });
</script>

<div class="w-full flex justify-center">
  <main class="main-leather flex flex-col space-y-6 max-w-2xl w-full my-6 px-4">
    <div class="flex justify-between items-center">
      <Heading tag="h1" class="h-leather mb-2">Events</Heading>
    </div>

    <P class="mb-3">
      Use this page to view any event (npub, nprofile, nevent, naddr, note,
      pubkey, NIP-05, or eventID).
    </P>

    <EventSearch
      {loading}
      {error}
      {searchValue}
      {event}
      onEventFound={handleEventFound}
    />
    {#if event}
      {#key event.id}
        <EventDetails {event} {profile} {searchValue} />
        <RelayActions {event} />
        {#if userPubkey}
          <div class="mt-8">
            <Heading tag="h2" class="h-leather mb-4">Add Comment</Heading>
            <CommentBox {event} {userPubkey} {userRelayPreference} />
          </div>
        {:else}
          <div class="mt-8 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
            <P>Please sign in to add comments.</P>
          </div>
        {/if}
      {/key}
    {/if}
  </main>
</div>
