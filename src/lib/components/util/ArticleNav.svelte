<script lang="ts">
  import { pharosInstance } from "$lib/parser";
  import TocToggle from "$components/util/TocToggle.svelte";
  import { EyeOutline, BookOutline, AlignCenterOutline, BookOpenOutline, GlobeOutline, ShareAllOutline, PenOutline } from "flowbite-svelte-icons";
  import { Button } from "flowbite-svelte";
  import { onMount } from "svelte";
  import { publicationColumnVisibility } from "$lib/stores";
  import InlineProfile from "$components/util/InlineProfile.svelte";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";

  let {
    rootId,
    publicationType
  } = $props<{
    rootId: any,
    publicationType: string
  }>();

  onMount(async () => {
    console.log($pharosInstance.getIndexMetadata());
  });

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

<nav class="Navbar navbar-leather sticky top-[76px] w-full px-2 sm:px-4 py-2.5 z-10">
  <div class="mx-auto flex flex-wrap justify-center space-x-2 container">
      <Button class='btn-leather !w-auto' outline={true} onclick={() => toggleColumn('details')} >
        <EyeOutline class="!fill-none inline mr-1"  /><span class="hidden sm:inline">Details</span>
      </Button>
      {#if publicationType === 'blog'}
        <Button class='btn-leather !w-auto' outline={true} onclick={() => toggleColumn('blog')} >
          <BookOutline class="!fill-none inline mr-1"  /><span class="hidden sm:inline">Table of Contents</span>
        </Button>
        <Button class='btn-leather !w-auto' outline={true} onclick={() => toggleColumn('inner')} >
          <BookOpenOutline class="!fill-none inline mr-1"  /><span class="hidden sm:inline">Content</span>
        </Button>
      {:else}
        <TocToggle rootId={rootId} />
      {/if}
      <Button class='btn-leather !w-auto' outline={true} onclick={() => toggleColumn('social')} >
        <GlobeOutline class="!fill-none inline mr-1"  /><span class="hidden sm:inline">Social</span>
      </Button>
  </div>
</nav>