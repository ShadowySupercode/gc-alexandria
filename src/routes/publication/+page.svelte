<script lang='ts'>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { Alert, P, Button } from 'flowbite-svelte';
  import { ExclamationCircleOutline } from 'flowbite-svelte-icons';
  import { ndkInstance } from '$lib/ndk';
  import { decodeNostrId, fetchEventSafely } from '$lib/utils';
  import { get } from 'svelte/store';
  
  import { page } from '$app/stores';
  
  // Get data from the server and from URL
  let { id: propId, dTag: propDTag } = $props<{ id?: string | null; dTag?: string | null }>();
  
  // Also check URL directly in case props weren't passed correctly
  const urlId = $page.url.searchParams.get('id');
  const urlDTag = $page.url.searchParams.get('d');
  
  // Use either source
  const id = propId || urlId;
  const dTag = propDTag || urlDTag;
  
  let message = $state('Redirecting...');
  let error = $state<string | null>(null);
  
  async function findAndRedirect() {
    try {
      // Log information for debugging
      console.log('Publication page mounted', { propId, propDTag, urlId, urlDTag, id, dTag });
      
      if (!id && !dTag) {
        message = 'No publication ID or d-tag provided. Redirecting to home...';
        console.log('No id or d tag provided, redirecting to home');
        setTimeout(() => goto('/'), 2000);
        return;
      }
      
      message = id 
        ? `Looking for publication with ID:\n${id}`
        : `Looking for publication with d-tag: ${dTag}...`;
      
      // Get the NDK instance
      const ndk = get(ndkInstance);
      if (!ndk) {
        throw new Error('NDK instance not available');
      }
      
      // Fetch the event
      let indexEvent;
      if (dTag) {
        console.log(`Fetching event with d tag: ${dTag}`);
        indexEvent = await fetchEventSafely(ndk, { '#d': [dTag] });
      } else if (id) {
        console.log(`Attempting to decode ID: ${id}`);
        const filter = decodeNostrId(id);
        
        if (filter) {
          console.log(`Fetching event with filter:`, filter);
          indexEvent = await fetchEventSafely(ndk, filter);
        } else {
          console.warn(`Could not decode ID: ${id}, trying raw ID`);
          // If we can't decode the ID, try using it directly
          indexEvent = await fetchEventSafely(ndk, id);
        }
      }
      
      if (!indexEvent) {
        throw new Error(`Event not found for ${id ? `ID: ${id}` : `d tag: ${dTag}`}`);
      }
      
      const pubkey = indexEvent.pubkey;
      const eventDTag = dTag || indexEvent.getMatchingTags('d')[0]?.[1];
      
      if (!eventDTag) {
        throw new Error(`No d tag found for event with ${id ? `ID: ${id}` : `d tag: ${dTag}`}`);
      }
      
      console.log(`Redirecting to canonical URL: /publication/${pubkey}/${eventDTag}`);
      goto(`/publication/${pubkey}/${eventDTag}`);
    } catch (err) {
      console.error('Error in client-side redirect:', err);
      error = err instanceof Error ? err.message : String(err);
      message = 'Failed to find publication. See error details below.';
    }
  }
  
  onMount(() => {
    findAndRedirect();
  });
</script>

<main class="flex flex-col items-center justify-center min-h-screen p-4">
  <Alert class="max-w-xl">
    <div class="flex items-center space-x-2 mb-4">
      <ExclamationCircleOutline class="w-6 h-6" />
      <span class="text-lg font-medium">
        Publication Redirect
      </span>
    </div>
    <P size="sm" class="mb-4 break-words">
      {message}
    </P>
    {#if error}
      <P size="xs" class="mb-6 text-red-600 break-words">
        Error: {error}
      </P>
    {/if}
    <div class="flex space-x-4 mt-4">
      <Button class="btn-leather !w-fit" size="sm" on:click={() => window.location.reload()}>
        Try Again
      </Button>
      <Button class="btn-leather !w-fit" size="sm" outline on:click={() => goto('/')}>
        Return home
      </Button>
    </div>
  </Alert>
</main>
