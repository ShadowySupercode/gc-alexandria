<script lang="ts">
  import { Heading, P } from "flowbite-svelte";
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import type { NDKEvent, NostrProfile } from "$lib/utils/nostrUtils";
  import EventSearch from "$lib/components/EventSearch.svelte";
  import EventDetails from "$lib/components/EventDetails.svelte";
  import RelayActions from "$lib/components/RelayActions.svelte";
  import CommentBox from "$lib/components/CommentBox.svelte";

  let loading = false;
  let error: string | null = null;
  let searchValue: string | null = null;
  let event: NDKEvent | null = null;
  let profile: NostrProfile | null = null;
  let userPubkey: string | null = null;
  let userRelayPreference = false;

  let searchTerm = "";

  $: {
    const urlSearchTerm = $page.url.searchParams.get("id") || "";
    if (urlSearchTerm) {
      searchValue = urlSearchTerm;
      error = null;
      loading = true;
    }
  }

  function handleEventFound(newEvent: NDKEvent) {
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
  }

  onMount(() => {
    // Get user's pubkey and relay preference from localStorage
    userPubkey = localStorage.getItem("userPubkey");
    userRelayPreference = localStorage.getItem("useUserRelays") === "true";
  });

  function onSubmit() {
    if (searchTerm.trim()) {
      searchValue = searchTerm.trim();
      error = null;
      loading = true;
    }
  }
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
