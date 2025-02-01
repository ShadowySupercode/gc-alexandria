<script lang="ts">
  import Article from "$lib/components/Article.svelte";
  import { TextPlaceholder } from "flowbite-svelte";
  import type { PageData } from "./$types";
  import { onDestroy, onMount } from "svelte";
  import ChatInterface from "$lib/components/ChatInterface.svelte";

  let { data }: { data: PageData } = $props();

  onDestroy(() => data.parser.reset());
</script>

<main>
  {#await data.waitable}
    <TextPlaceholder size="xxl" />
  {:then}
    <Article rootId={data.parser.getRootIndexId()} />
  {/await}
</main>
