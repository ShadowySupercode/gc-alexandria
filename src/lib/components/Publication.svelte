<script lang="ts">
  import Preview from "./Preview.svelte";
  import { pharosInstance } from "$lib/parser";
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

{#if $publicationColumnVisibility.details}
  <div class="flex flex-col space-y-4 max-w-xl min-w-24 sm:min-w-36 sm:flex-grow-1 p-2 overflow-auto">
    <div class="card-leather bg-highlight dark:bg-primary-800 p-4 mx-2 rounded-lg border">
      <Details event={indexEvent} />
    </div>
  </div>
{/if}

{#if isDefaultVisible()}
  <div class="flex flex-col space-y-4 overflow-auto 
          {publicationType === 'blog' ? 'max-w-xl flex-grow-1' : 'max-w-2xl flex-grow-2' }
          {currentBlog !== null ? 'discreet' : ''}
  ">
    <div class="card-leather bg-highlight dark:bg-primary-800 p-4 mx-2 mb-4 rounded-lg border">
      <Details event={indexEvent} />
    </div>

    <Preview {rootId} {publicationType} index={0} onBlogUpdate={loadBlog} />
  </div>
{/if}

{#if currentBlog !== null && $publicationColumnVisibility.inner }
  {#key currentBlog }
  <div class="flex flex-col space-y-4 max-w-3xl overflow-auto flex-grow-2">
    <Preview rootId={currentBlog} {publicationType} index={0} />
  </div>
  {/key}
{/if}

{#if $publicationColumnVisibility.social }
  <div class="flex flex-col space-y-4 max-w-xl overflow-auto flex-grow-1">

  </div>
{/if}

<style>
  :global(.sidebar-group-leather) {
    max-height: calc(100vh - 8rem);
  }
</style>
