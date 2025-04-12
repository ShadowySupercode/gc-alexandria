<script lang="ts">
  import Article from "$lib/components/Publication.svelte";
  import { TextPlaceholder } from "flowbite-svelte";
  import type { PageData } from "./$types";
  import { onDestroy } from "svelte";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";

  // Extend the PageData type with the properties we need
  interface ExtendedPageData extends PageData {
    waitable: Promise<any>;
    publicationType: string;
    indexEvent: NDKEvent;
  }

  let { data } = $props<{ data: ExtendedPageData }>();

  onDestroy(() => data.parser.reset());
</script>

<main>
  {#await data.waitable}
    <TextPlaceholder divClass='skeleton-leather w-full' size="xxl" />
  {:then}
  <Article 
      rootId={data.parser.getRootIndexId()} 
      publicationType={data.publicationType} 
      indexEvent={data.indexEvent} 
    />
  {/await}
</main>
