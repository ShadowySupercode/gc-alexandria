<script lang="ts">
  import { pharosInstance } from "$lib/parser";
  import TocToggle from "$components/util/TocToggle.svelte";
  import { EyeOutline, BookOutline } from "flowbite-svelte-icons";
  import { Button } from "flowbite-svelte";
  import { onMount } from "svelte";
  import { ndkInstance } from "$lib/ndk";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";

  let {
    rootId,
    publicationType
  } = $props<{
    rootId: any
    publicationType: string
  }>();

  let index: null|NDKEvent = $state(null);

  onMount(async () => {
    index = await $ndkInstance.fetchEvent({ ids: [rootId] });
  });

  let metadata = $state($pharosInstance.getIndexMetadata());
</script>

<nav class="Navbar navbar-leather sticky top-[76px] w-full px-2 sm:px-4 py-2.5 z-10">
  <div class="mx-auto flex flex-wrap justify-between items-center container">
    <div class="actions">
      <Button class='btn-leather !w-auto' outline={true}  >
        <EyeOutline class="!fill-none inline mr-1"  /> Details
      </Button>
      {#if publicationType === 'blog'}
        <Button class='btn-leather !w-auto' outline={true} >
          <BookOutline class="!fill-none inline mr-1"  /> Table of Contents
        </Button>
      {:else}
        <TocToggle rootId={rootId} />
      {/if}
    </div>
  </div>
</nav>