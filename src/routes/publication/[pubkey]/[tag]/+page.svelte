<script lang='ts'>
  import Article from '$lib/components/Publication.svelte';
  import { TextPlaceholder } from 'flowbite-svelte';
  import type { PageData } from './$types';
  import { onDestroy } from 'svelte';

  let { data }: { data: PageData } = $props();

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