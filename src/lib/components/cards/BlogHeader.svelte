<script lang="ts">
  import type { NostrEvent } from '$lib/types/nostr';
  import { Card } from "flowbite-svelte";
  import { userBadge } from "$lib/snippets/UserSnippets.svelte";
  import Interactions from "$components/util/Interactions.svelte";
  import CardActions from "$components/util/CardActions.svelte";
  import { formatTimestampToDate } from "$lib/utils";
  import CardImage from "$components/cards/partial/CardImage.svelte";

  // Helper functions to get tag values from a NostrEvent
  function getTagValue<T = string>(event: NostrEvent, tagName: string): T | undefined {
    const matches = event.tags.filter((tag) => tag[0] === tagName);
    if (matches.length > 1) {
      // Do not throw; just return the first value
      return matches[0]?.[1] as T | undefined;
    }
    return matches[0]?.[1] as T | undefined;
  }

  function getTagValues<T = string>(event: NostrEvent, tagName: string): T[] {
    return event.tags
      .filter((tag) => tag[0] === tagName)
      .map((tag) => tag[1] as T);
  }

  const {
    rootId,
    event,
    onBlogUpdate,
    active = true,
  } = $props<{
    rootId: string;
    event: NostrEvent;
    onBlogUpdate?: any;
    active: boolean;
  }>();

  let title: string = $derived.by(() => getTagValue(event, "title") ?? "Untitled");
  let author: string = $derived.by(
    () => getTagValue(event, "author") ?? "unknown",
  );
  let image: string | null = $derived.by(() => getTagValue(event, "image") ?? null);
  let authorPubkey: string | null = $derived.by(() => getTagValue(event, "p") ?? null);
  let hashtags: string[] = $derived.by(() => getTagValues(event, "t"));

  function showBlog() {
    onBlogUpdate?.(rootId);
  }
</script>

{#if title != null}
  <Card
    class="ArticleBox card-leather w-full grid max-w-xl {active
      ? 'active'
      : ''}"
  >
    <div class="space-y-4">
      <div class="flex flex-row justify-between my-2">
        <div class="flex flex-col">
          {#if authorPubkey}
            {@render userBadge(authorPubkey, author)}
          {:else}
            <span>{author}</span>
          {/if}
          <span class="text-gray-500"
            >{formatTimestampToDate(event.created_at)}</span
          >
        </div>
        <CardActions {event} />
      </div>
      {#if active && image}
        <div class="ArticleBoxImage flex justify-center">
          <CardImage imageUrl={image} {title} useFallbackColor={false} />
        </div>
      {/if}
      <div class="flex flex-col flex-grow space-y-4">
        <button onclick={() => showBlog()} class="text-left">
          <h2 class="text-lg font-bold line-clamp-2" {title}>{title}</h2>
        </button>
        {#if hashtags && hashtags.length > 0}
          <div class="tags">
            {#each hashtags as tag}
              <span>{tag}</span>
            {/each}
          </div>
        {/if}
      </div>
      {#if active}
        <Interactions {rootId} {event} />
      {/if}
    </div>
  </Card>
{/if}
