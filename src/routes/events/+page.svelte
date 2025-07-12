<script lang="ts">
  import { Heading, P } from "flowbite-svelte";
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import type { NDKEvent } from '$lib/utils/nostrUtils';
  import EventSearch from '$lib/components/EventSearch.svelte';
  import EventDetails from '$lib/components/EventDetails.svelte';
  import RelayActions from '$lib/components/RelayActions.svelte';
  import CommentBox from '$lib/components/CommentBox.svelte';
  import { userStore } from '$lib/stores/userStore';

  let loading = $state(false);
  let error = $state<string | null>(null);
  let searchValue = $state<string | null>(null);
  let event = $state<NDKEvent | null>(null);
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
  userStore.subscribe(val => user = val);

  function handleEventFound(newEvent: NDKEvent) {
    event = newEvent;
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

  onMount(async () => {
    const id = $page.url.searchParams.get('id');
    if (id) {
      searchValue = id;
    }
  });
</script>

<div class="w-full flex justify-center">
  <main class="main-leather flex flex-col space-y-6 max-w-2xl w-full my-6 px-4">
    <div class="flex justify-between items-center">
      <Heading tag="h1" class="h-leather mb-2">Events</Heading>
    </div>

    <P class="mb-3">
      Use this page to view any event (npub, nprofile, nevent, naddr, note, pubkey, or eventID).
    </P>

    <EventSearch {loading} {error} {searchValue} {event} onEventFound={handleEventFound} />
    {#if event}
      <EventDetails {event} {profile} {searchValue} />
      <RelayActions {event} />
      {#if user.signedIn}
        <div class="mt-8">
          <Heading tag="h2" class="h-leather mb-4">Add Comment</Heading>
          <CommentBox {event} />
        </div>
      {:else}
        <div class="mt-8 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
          <P>Please sign in to add comments.</P>
        </div>
      {/if}
    {/if}
  </main>
</div>
