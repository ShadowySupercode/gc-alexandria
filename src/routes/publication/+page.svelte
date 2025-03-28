<script lang="ts">
  import Article from "$lib/components/Publication.svelte";
  import { TextPlaceholder } from "flowbite-svelte";
  import type { PageData } from "./$types";
  import { onDestroy } from "svelte";
  import ArticleNav from "$components/util/ArticleNav.svelte";

  let { data }: { data: PageData } = $props();

  onDestroy(() => data.parser.reset());
</script>

{#key data}
  <ArticleNav publicationType={data.publicationType} rootId={data.parser.getRootIndexId()}  />
{/key}

<main class={data.publicationType}>
  {#await data.waitable}
    <TextPlaceholder divClass='skeleton-leather w-full' size="xxl" />
  {:then}
    <Article rootId={data.parser.getRootIndexId()} publicationType={data.publicationType} />
  {/await}
</main>
