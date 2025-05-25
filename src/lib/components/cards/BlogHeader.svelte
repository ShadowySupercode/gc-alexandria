<script lang="ts">
  import type { NDKEvent } from "@nostr-dev-kit/ndk";
  import { scale } from "svelte/transition";
  import { Card } from "flowbite-svelte";
  import { userBadge } from "$lib/snippets/UserSnippets.svelte";
  import Interactions from "$components/util/Interactions.svelte";
  import { quintOut } from "svelte/easing";
  import CardActions from "$components/util/CardActions.svelte";
  import { formatTimestampToDate } from "$lib/utils/dateUtils";
  import CardImage from "$lib/components/cards/CardImage.svelte";

  const {
    rootId,
    event,
    onBlogUpdate,
    active = true,
  } = $props<{
    rootId: string;
    event: NDKEvent;
    onBlogUpdate?: any;
    active: boolean;
  }>();

  let title: string = $derived.by(() => event.getTagValue("title"));
  let author: string = $derived.by(
    () => event.getTagValue("author") ?? "unknown",
  );
  let image: string = $derived.by(() => event.getTagValue("image") ?? null);
  let authorPubkey: string = $derived.by(() => event.getTagValue("p") ?? null);
  let hashtags: string[] = $derived.by(() => event.getTagValues("t"));

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
          {@render userBadge(authorPubkey, author)}
          <span class="text-gray-500"
            >{formatTimestampToDate(event.created_at)}</span
          >
        </div>
        <CardActions {event} />
      </div>
      {#if active}
        <div class="ArticleBoxImage flex justify-center">
          <CardImage imageUrl={image} {title} useFallbackColor={false} />
        </div>
      {/if}
      <div class="flex flex-col flex-grow space-y-4">
        <button onclick={() => showBlog()} class="text-left">
          <h2 class="text-lg font-bold line-clamp-2" {title}>{title}</h2>
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
        <Interactions {rootId} {event} />
      {/if}
    </div>
  </Card>
{/if}
