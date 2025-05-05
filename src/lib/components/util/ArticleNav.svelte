<script lang="ts">
  import TocToggle from "$components/util/TocToggle.svelte";
  import { BookOutline, CaretLeftOutline } from "flowbite-svelte-icons";
  import { Button } from "flowbite-svelte";
  import { publicationColumnVisibility } from "$lib/stores";
  import InlineProfile from "$components/util/InlineProfile.svelte";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";

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
  function toggleColumn(column: 'blog'|'inner'|'social') {
    publicationColumnVisibility.update(store => {
      store[column] = !store[column]; // Toggle true/false
      if (window.innerWidth < 1140) {
        $publicationColumnVisibility.inner = false;
      }
      return { ...store }; // Ensure reactivity
    });
  }

  function backToMain() {
    $publicationColumnVisibility.blog = true;
    $publicationColumnVisibility.inner = false;
  }

</script>

<nav class="Navbar navbar-leather flex sticky top-[76px] w-full min-h-[70px] px-2 sm:px-4 py-2.5 z-10">
  <div class="flex flex-wrap space-x-2 container">
    <div class="flex items-center space-x-2">
      {#if publicationType === 'blog'}
        {#if $publicationColumnVisibility.inner}
        <Button class='btn-leather !w-auto' outline={true} onclick={backToMain}>
          <CaretLeftOutline class="!fill-none inline mr-1" /><span class="hidden sm:inline">Back</span>
        </Button>
        {/if}
        <Button class="btn-leather !w-auto {$publicationColumnVisibility.blog ? 'active' : ''}"
                outline={true} onclick={() => toggleColumn('blog')} >
          <BookOutline class="!fill-none inline mr-1"  /><span class="hidden sm:inline">Table of Contents</span>
        </Button>
      {:else}
        <TocToggle rootId={rootId} />
      {/if}

    </div>
    <div class="flex text items-center">
        <p class="line-ellipsis"><b>{title}</b> <span>by <InlineProfile pubkey={pubkey} title={author} /></span></p>
    </div>
  </div>
</nav>