<script lang="ts">
  import InlineProfile from "$components/util/InlineProfile.svelte";
  import CardActions from "$components/util/CardActions.svelte";
  import Interactions from "$components/util/Interactions.svelte";

  let { event, isModal = false } = $props();

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
  let hashtags: [] = $derived(event.getMatchingTags('t') ?? []);
  let rootId: string = $derived(event.getMatchingTags('d')[0]?.[1] ?? null);

</script>


<div class="flex flex-row relative">
  <div class="flex-grow grid grid-cols-1 md:grid-cols-[auto_1fr] gap-4 items-center">
    {#if image}
      <div>
        <img class="w-full md:max-w-48 object-contain rounded" alt={title} src={image} />
      </div>
    {/if}
    <div class="space-y-4">
      <h1 class="text-3xl font-bold">{title}</h1>
      <h2 class="text-base font-bold">
        by
        {#if originalAuthor !== null}
          <InlineProfile pubkey={originalAuthor} title={author} />
        {:else}
          {author}
        {/if}
      </h2>
      <h4 class="text-base font-thin">Version: {version}</h4>
    </div>
  </div>

  <div class="absolute right-0 sm:relative sm:flex sm:flex-col space-y-4">
    {#if !isModal}
       <CardActions event={event}></CardActions>
    {/if}
  </div>
</div>

{#if summary}
  <div class="flex flex-row my-2">
    <p class='text-base text-primary-900 dark:text-highlight'>{summary}</p>
  </div>
{/if}

{#if hashtags.length}
  <div class="tags my-2">
    {#each hashtags as tag}
      <span class="text-sm">#{tag[1]}</span>
    {/each}
  </div>
{/if}

<div class="flex flex-row my-4">
  <h4 class='text-base font-normal mt-2'>Index author: <InlineProfile pubkey={event.pubkey} /></h4>
</div>

<div class="flex flex-col pb-4 space-y-1">
  {#if source !== null}
    <h5 class="text-sm">Source: <a class="underline break-all" href={source} target="_blank">{source}</a></h5>
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

{#if !isModal}
  <Interactions event={event} rootId={rootId} direction="row"/>
{/if}