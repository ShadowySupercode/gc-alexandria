<script lang="ts">
  import type { NDKEvent } from '@nostr-dev-kit/ndk';
  import { scale } from 'svelte/transition';
  import {  Card, Img } from "flowbite-svelte";
  import { userBadge } from "$lib/snippets/UserSnippets.svelte";
  import Interactions from "$components/util/Interactions.svelte";
  import { quintOut } from "svelte/easing";
  import CardActions from "$components/util/CardActions.svelte";

  const { rootId, event, onBlogUpdate, active = true } = $props<{ rootId: string, event: NDKEvent, onBlogUpdate?: any, active: boolean  }>();

  let title: string = $derived(event.getMatchingTags('title')[0]?.[1]);
  let author: string = $derived(getMatchingTags(event, 'author')[0]?.[1] ?? 'unknown');
  let image: string = $derived(event.getMatchingTags('image')[0]?.[1] ?? null);
  let authorPubkey: string = $derived(event.getMatchingTags('p')[0]?.[1] ?? null);
  let hashtags: string = $derived(event.getMatchingTags('t') ?? null);

  function publishedAt() {
    const date = event.created_at ? new Date(event.created_at * 1000) : '';
    if (date !== '') {
      const formattedDate = new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "short",
        day: "2-digit",
      }).format(date);
      return formattedDate ?? "";
    }
    return '';
  }

  function showBlog() {
    onBlogUpdate?.(rootId);
  }
</script>

{#if title != null}
  <Card class="ArticleBox card-leather w-full grid max-w-xl {active ? 'active' : ''}">
    <div class='space-y-4'>
      <div class="flex flex-row justify-between my-2">
        <div class="flex flex-col">
          {@render userBadge(authorPubkey, author)}
          <span class='text-gray-500'>{publishedAt()}</span>
        </div>
        <CardActions event={event} />
      </div>
      {#if image && active}
        <div class="ArticleBoxImage flex col justify-center"
             in:scale={{ start: 0.8, duration: 500, delay: 100, easing: quintOut }}
        >
          <Img src={image} class="rounded w-full max-h-72 object-cover"/>
        </div>
      {/if}
      <div class='flex flex-col flex-grow space-y-4'>
        <button onclick={() => showBlog()} class='text-left'>
          <h2 class='text-lg font-bold line-clamp-2' title="{title}">{title}</h2>
        </button>
        {#if hashtags}
        <div class="tags">
          {#each hashtags as tag}
            <span>{tag}</span>
          {/each}
        </div>
        {/if}
      </div>
      {#if active}
          <Interactions rootId={rootId} event={event}  />
      {/if}
    </div>
  </Card>
{/if}
