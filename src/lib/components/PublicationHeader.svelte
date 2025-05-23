<script lang="ts">
  import { ndkInstance } from '$lib/ndk';
  import { naddrEncode } from '$lib/utils';
  import type { NDKEvent } from '@nostr-dev-kit/ndk';
  import { standardRelays } from '../consts';
  import { Card, Img } from "flowbite-svelte";
  import CardActions from "$components/util/CardActions.svelte";
  import { userBadge } from "$lib/snippets/UserSnippets.svelte";

  const { event } = $props<{ event: NDKEvent }>();

  const relays = $derived.by(() => $ndkInstance.activeUser?.relayUrls ?? standardRelays);

  const href = $derived.by(() => {
    const d = event.getTagValue('d');
    if (d != null) {
      return `publication?d=${d}`;
    } else {
      return `publication?id=${naddrEncode(event, relays)}`;
    }
  });

  let showActions = $state(false);

  const eventMetadata = {
    title: event.getTagValue('title') || 'Untitled',
    author: event.getTagValue('author') || 'Unknown Author',
    type: event.getTagValue('type') || 'Unknown Type',
    summary: event.getTagValue('summary') || '',
    hashtags: event.getTagValues('t'),
    publishedAt: event.created_at ? new Date(event.created_at * 1000).toLocaleDateString() : 'Unknown Date'
  };

  let displayType = $derived.by(() => {
    const type = eventMetadata.type.toLowerCase();
    switch (type) {
      case 'book': return 'Book';
      case 'illustrated': return 'Illustrated Book';
      case 'magazine': return 'Magazine';
      case 'documentation': return 'Documentation';
      case 'academic': return 'Academic Paper';
      case 'blog': return 'Blog Post';
      default: return type.charAt(0).toUpperCase() + type.slice(1);
    }
  });

  let showSummary = $derived.by(() => 
    eventMetadata.summary.length > 0
  );

  let showHashtags = $derived.by(() => 
    eventMetadata.hashtags.length > 0
  );

  let showActionsPanel = $derived.by(() => 
    showActions && eventMetadata.title !== 'Untitled'
  );

  let croppedSummary = $derived.by(() => {
    const maxLen = 150;
    if (eventMetadata.summary.length > maxLen) {
      return eventMetadata.summary.slice(0, maxLen) + '...';
    }
    return eventMetadata.summary;
  });

  console.log("PublicationHeader event:", event);
</script>

{#if eventMetadata.title != null && href != null}
  <Card 
    class='ArticleBox card-leather w-full h-96 max-w-md flex flex-row space-x-2 min-h-96'
    on:mouseenter={() => showActions = true}
    on:mouseleave={() => showActions = false}
  >
    {#if event.getTagValue('image') != null}
      <div class="flex col justify-center align-middle max-h-36 max-w-24 overflow-hidden">
        <Img src={event.getTagValue('image')} class="rounded w-full h-full object-cover"/>
      </div>
    {/if}
    <div class='col flex flex-row flex-grow space-x-4'>
      <div class="flex flex-col flex-grow">
        <a href="/{href}" class='flex flex-col space-y-2 h-full'>
          <h2 class='text-lg font-bold line-clamp-2' title="{eventMetadata.title}">{eventMetadata.title}</h2>
          <h3 class='text-base font-normal'>
            by
            {#if event.getTagValue('p') != null}
              {@render userBadge(event.getTagValue('p'), eventMetadata.author)}
            {:else}
              {eventMetadata.author}
            {/if}
          </h3>
          <p class="text-gray-600 dark:text-gray-400">
            {eventMetadata.publishedAt}
          </p>
          <p class="text-sm text-gray-500 mt-1">Type: {displayType}</p>
          {#if showSummary}
            <p class="mt-2 text-gray-700 dark:text-gray-300 line-clamp-4" title={eventMetadata.summary}>
              {croppedSummary}
            </p>
          {/if}
          {#if showHashtags}
            <div class="flex flex-wrap gap-2 mt-2">
              {#each eventMetadata.hashtags as tag}
                <span class="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded-full text-sm">
                  #{tag}
                </span>
              {/each}
            </div>
          {/if}
        </a>
      </div>
      <div class="flex flex-col justify-start items-center">
        {#if showActionsPanel}
          <CardActions event={event} />
        {/if}
      </div>
    </div>
  </Card>
{/if}
