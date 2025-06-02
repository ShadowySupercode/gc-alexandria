<script lang="ts">
  import { userBadge } from "$lib/snippets/UserSnippets.svelte";
  import CardActions from "$components/util/CardActions.svelte";
  import Interactions from "$components/util/Interactions.svelte";
  import { P } from "flowbite-svelte";
  import { getTagValue, getTagValues } from '$lib/utils/eventUtils';
  import DisplayType from "$components/cards/DisplayType.svelte";
  import type { NostrEvent } from "$lib/types/nostr";

  // isModal
  //  - don't show interactions in modal view
  //  - don't show all the details when _not_ in modal view
  let { event, isModal = false } = $props<{ event: NostrEvent, isModal?: boolean }>();

  let title = $derived.by(() => getTagValue(event, 'title') ?? '');
  let author = $derived.by(() => getTagValue(event, 'author') ?? 'unknown');
  let version = $derived.by(() => getTagValue(event, 'version') ?? '1');
  let image = $derived.by(() => getTagValue(event, 'image') ?? '');
  let originalAuthor = $derived.by(() => getTagValue(event, 'p') ?? '');
  let summary = $derived.by(() => getTagValue(event, 'summary') ?? '');
  let type = $derived.by(() => getTagValue(event, 'type') ?? '');
  let language = $derived.by(() => getTagValue(event, 'l') ?? '');
  let source = $derived.by(() => getTagValue(event, 'source') ?? '');
  let publisher = $derived.by(() => getTagValue(event, 'published_by') ?? '');
  let identifier = $derived.by(() => getTagValue(event, 'i') ?? '');
  let hashtags = $derived.by(() => getTagValues(event, 't'));
  let rootId = $derived.by(() => getTagValue(event, 'd') ?? '');
  let kind = $derived.by(() => event.kind);
</script>

<div class="flex flex-col relative mb-2">
  {#if !isModal}
    <div class="flex flex-row justify-between items-center">
      <P class="text-base font-normal"
        >{@render userBadge(event.pubkey, author)}</P
      >
      <CardActions {event}></CardActions>
    </div>
  {/if}
  <div
    class="flex-grow grid grid-cols-1 md:grid-cols-[auto_1fr] gap-4 items-center"
  >
    {#if image}
      <div class="my-2">
        <img
          class="w-full md:max-w-48 object-contain rounded"
          alt={title}
          src={image}
        />
      </div>
    {/if}
    <div class="space-y-4 my-4">
      <h1 class="text-3xl font-bold">{title}</h1>
      <h2 class="text-base font-bold">
        by
        {#if originalAuthor !== null}
          {@render userBadge(originalAuthor, author)}
        {:else}
          {author}
        {/if}
      </h2>
      {#if version !== "1"}
        <h4 class="text-base font-thin">Version: {version}</h4>
      {/if}
    </div>
  </div>
</div>

{#if summary}
  <div class="flex flex-row my-2">
    <p class="text-base text-primary-900 dark:text-highlight">{summary}</p>
  </div>
{/if}

{#if hashtags.length}
  <div class="tags my-2">
    {#each hashtags as tag}
      <span class="text-sm">#{tag}</span>
    {/each}
  </div>
{/if}

{#if isModal}
  <div class="flex flex-row my-4">
    <h4 class="text-base font-normal mt-2">
      {#if kind === 30040}
        <span>Index author:</span>
      {:else}
        <span>Author:</span>
      {/if}
      {@render userBadge(event.pubkey, author)}
    </h4>
  </div>

  <div class="flex flex-col pb-4 space-y-1">
    {#if source !== null}
      <h5 class="text-sm">
        Source: <a class="underline break-all" href={source} target="_blank"
          >{source}</a
        >
      </h5>
    {/if}
    {#if type !== null}
      <h5 class="text-sm"><DisplayType {type} /></h5>
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
  <Interactions {event} {rootId} direction="row" />
{/if}
