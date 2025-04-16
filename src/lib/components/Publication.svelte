<script lang="ts">
  import Preview from "./Preview.svelte";
  import { pharosInstance } from "$lib/parser";
  import { page } from "$app/state";
  import { ndkInstance } from "$lib/ndk";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";
  import Details from "$components/util/Details.svelte";
  import { publicationColumnVisibility } from "$lib/stores";

  let { rootId, publicationType, indexEvent } = $props<{ 
    rootId: string, 
    publicationType: string,
    indexEvent: NDKEvent
  }>();

  if (rootId !== $pharosInstance.getRootIndexId()) {
    console.error("Root ID does not match parser root index ID");
  }

  let activeHash = $state(page.url.hash);

  let currentBlog: null|string = $state(null);

  function isDefaultVisible() {
    if (publicationType !== 'blog') {
      return true;
    } else {
      return $publicationColumnVisibility.blog;
    }
  }

  function loadBlog(rootId: string) {
    // depending on the size of the screen, also toggle blog list visibility
    if (window.innerWidth < 1024) {
      $publicationColumnVisibility.blog = false;
    }
    $publicationColumnVisibility.inner = true;
    currentBlog = rootId;
  }
</script>


{#if showTocButton && !showToc}
  <Button
    class="btn-leather fixed top-20 left-4 h-6 w-6"
    outline={true}
    on:click={(ev) => {
      showToc = true;
      ev.stopPropagation();
    }}
  >
    <BookOutline />
  </Button>
  <Tooltip>Show Table of Contents</Tooltip>
{/if}

{#if currentBlog !== null && $publicationColumnVisibility.inner }
  {#key currentBlog }
  <div class="flex flex-col space-y-4 max-w-3xl overflow-auto flex-grow-2">
    <Preview rootId={currentBlog} {publicationType} index={0} />
  </div>
  {/key}
{/if}

<style>
  :global(.sidebar-group-leather) {
    max-height: calc(100vh - 8rem);
  }
</style>
