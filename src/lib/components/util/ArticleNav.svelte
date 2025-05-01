<script lang="ts">
  import TocToggle from "$components/util/TocToggle.svelte";
  import { EyeOutline, BookOutline,  BookOpenOutline, GlobeOutline } from "flowbite-svelte-icons";
  import { Button } from "flowbite-svelte";
  import { publicationColumnVisibility } from "$lib/stores";
  import InlineProfile from "$components/util/InlineProfile.svelte";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';

  let scrollY = $state(0);

  // Run this every time the scroll event happens
  function updateScroll() {
    scrollY = window.scrollY;
  }

  onMount(() => {
    window.addEventListener('scroll', updateScroll);
    updateScroll(); // Set initial value

    return () => {
      window.removeEventListener('scroll', updateScroll);
    };
  });

  let {
    rootId,
    publicationType,
    indexEvent
  } = $props<{
    rootId: any,
    publicationType: string,
    indexEvent: NDKEvent
  }>();

  let title: string = $derived(indexEvent.getMatchingTags('title')[0]?.[1]);
  let author: string = $derived(indexEvent.getMatchingTags('author')[0]?.[1] ?? 'unknown');
  let pubkey: string = $derived(indexEvent.getMatchingTags('p')[0]?.[1] ?? null);

  // Function to toggle column visibility
  function toggleColumn(column: 'details'|'blog'|'inner'|'social') {
    publicationColumnVisibility.update(store => {
      store[column] = !store[column]; // Toggle true/false
      if (window.innerWidth < 1140) {
        $publicationColumnVisibility.inner = false;
      }
      return { ...store }; // Ensure reactivity
    });
  }

</script>

<nav class="Navbar navbar-leather sticky top-[75px] w-full min-h-[70px] px-2 sm:px-4 py-2.5 z-10">
  <div class="mx-auto flex flex-wrap justify-around space-x-2 container">
    {#if scrollY < 100}
      <div class="buttons" transition:fade={{ duration: 300 }}>
        <Button class='btn-leather !w-auto hidden' outline={true} onclick={() => toggleColumn('details')} >
          <EyeOutline class="!fill-none inline mr-1"  /><span class="hidden sm:inline">Details</span>
        </Button>
        {#if publicationType === 'blog'}
          <Button class='btn-leather !w-auto hidden' outline={true} onclick={() => toggleColumn('blog')} >
            <BookOutline class="!fill-none inline mr-1"  /><span class="hidden sm:inline">Table of Contents</span>
          </Button>
          <Button class='btn-leather !w-auto hidden' outline={true} onclick={() => toggleColumn('inner')} >
            <BookOpenOutline class="!fill-none inline mr-1"  /><span class="hidden sm:inline">Content</span>
          </Button>
        {:else}
          <TocToggle rootId={rootId} />
        {/if}
        <Button class='btn-leather !w-auto hidden' outline={true} onclick={() => toggleColumn('social')} >
          <GlobeOutline class="!fill-none inline mr-1"  /><span class="hidden sm:inline">Social</span>
        </Button>
      </div>
    {:else if scrollY > 200 }
      <div class="text max-w-full" transition:fade={{ duration: 300 }}>
        <p class="line-ellipsis"><b>{title}</b><br><span>by <InlineProfile pubkey={pubkey} title={author} /></span></p>
      </div>
    {/if}
  </div>
</nav>