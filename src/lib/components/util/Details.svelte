<script lang="ts">
  import InlineProfile from "$components/util/InlineProfile.svelte";

  let { event } = $props();

  let title: string = $derived(event.getMatchingTags('title')[0]?.[1]);
  let author: string = $derived(event.getMatchingTags('author')[0]?.[1] ?? 'unknown');
  let version: string = $derived(event.getMatchingTags('version')[0]?.[1] ?? '1');
  let image: string = $derived(event.getMatchingTags('image')[0]?.[1] ?? null);
  let originalAuthor: string = $derived(event.getMatchingTags('p')[0]?.[1] ?? null);
  let summary: string = $derived(event.getMatchingTags('summary')[0]?.[1] ?? null);
  let type: string = $derived(event.getMatchingTags('type')[0]?.[1] ?? null);
  let language: string = $derived(event.getMatchingTags('l')[0]?.[1] ?? null);
  let source: string = $derived(event.getMatchingTags('source')[0]?.[1] ?? null);
  let publisher: string = $derived(event.getMatchingTags('published_by')[0]?.[1] ?? null);
  let identifier: string = $derived(event.getMatchingTags('i')[0]?.[1] ?? null);

</script>

<div class="flex flex-row md:space-x-4 max-sm:flex-wrap">
  {#if image}
    <div class="flex col">
      <img class="md:max-w-48 max-sm:w-full object-cover" alt={title} src={image} />
    </div>
  {/if}
  <div class="flex flex-col col space-y-5  justify-center  align-middle">
    <h1 class="text-3xl font-bold mt-5">{title}</h1>
    <h2 class="text-base font-bold">by
      {#if originalAuthor !== null}
        <InlineProfile pubkey={originalAuthor} title={author} />
      {:else}
        {author}
      {/if}
    </h2>
    <h4 class='text-base font-thin mt-2'>Version: {version}</h4>
  </div>
</div>

{#if summary}
  <div class="flex flex-row ">
    <p class='text-base text-primary-900 dark:text-highlight'>{summary}</p>
  </div>
{/if}

<div class="flex flex-row ">
  <h4 class='text-base font-normal mt-2'>Index author: <InlineProfile pubkey={event.pubkey} /></h4>
</div>

<div class="flex flex-col pb-4 space-y-1">
  {#if source !== null}
    <h5 class="text-sm">Source: <a class="underline" href={source} target="_blank">{source}</a></h5>
  {/if}
  {#if type !== null}
    <h5 class="text-sm">Publication type: {type}</h5>
  {/if}
  {#if language !== null}
    <h5 class="text-sm">Language: {language}</h5>
  {/if}
  {#if publisher !== null}
    <h5 class="text-sm">Published by: {publisher}</h5>
  {/if}
  {#if identifier !== null}
    <h5 class="text-sm">{identifier}</h5>
  {/if}

</div>