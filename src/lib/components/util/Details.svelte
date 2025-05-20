<script lang="ts">
  import InlineProfile from "$components/util/InlineProfile.svelte";
  import CardActions from "$components/util/CardActions.svelte";
  import Interactions from "$components/util/Interactions.svelte";
  import { P } from "flowbite-svelte";

  // isModal
  //  - don't show interactions in modal view
  //  - don't show all the details when _not_ in modal view
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
  let kind = $derived(event.kind);


</script>


<div class="flex flex-col relative mb-2">
  {#if !isModal}
    <div class="flex flex-row justify-between items-center">
      <P class='text-base font-normal'><InlineProfile pubkey={event.pubkey} /></P>
      <CardActions event={event}></CardActions>
    </div>
  {/if}
  <div class="flex-grow grid grid-cols-1 md:grid-cols-[auto_1fr] gap-4 items-center">
    {#if image}
      <div class="my-2">
        <img class="w-full md:max-w-48 object-contain rounded" alt={title} src={image} />
      </div>
    {/if}
    <div class="space-y-4  my-4">
      <h1 class="text-3xl font-bold">{title}</h1>
      <h2 class="text-base font-bold">
        by
        {#if originalAuthor !== null}
          <InlineProfile pubkey={originalAuthor} title={author} />
        {:else}
          {author}
        {/if}
      </h2>
      {#if version !== '1' }
        <h4 class="text-base font-thin">Version: {version}</h4>
      {/if}
    </div>
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

{#if isModal}
  <div class="flex flex-row my-4">
    <h4 class='text-base font-normal mt-2'>
      {#if kind === 30040}
        <span>Index author:</span>
      {:else}
        <span>Author:</span>
      {/if}
      <InlineProfile pubkey={event.pubkey} />
    </h4>
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
{/if}

{#if !isModal}
  <Interactions event={event} rootId={rootId} direction="row"/>
{/if}