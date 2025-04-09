<script lang="ts">
  import Article from "$lib/components/Publication.svelte";
  import { TextPlaceholder } from "flowbite-svelte";
  import type { PageData } from "./$types";
  import { onDestroy, setContext } from "svelte";
  import { PublicationTree } from "$lib/data_structures/publication_tree";

  let { data }: { data: PageData } = $props();

  const publicationTree = new PublicationTree(data.publicationRootEvent, data.ndk);

  setContext('publicationTree', publicationTree);

  onDestroy(() => data.parser.reset());
</script>

<main>
  {#await data.waitable}
    <TextPlaceholder divClass='skeleton-leather w-full' size="xxl" />
  {:then}
    <Article rootId={data.parser.getRootIndexId()} publicationType={data.publicationType} />
  {/await}
</main>
