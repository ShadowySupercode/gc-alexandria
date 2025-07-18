<script lang="ts">
  import type { NDKEvent } from "@nostr-dev-kit/ndk";
  import { scale } from "svelte/transition";
  import { Card } from "flowbite-svelte";
  import { userBadge } from "$lib/snippets/UserSnippets.svelte";
  import Interactions from "$components/util/Interactions.svelte";
  import { quintOut } from "svelte/easing";
  import CardActions from "$components/util/CardActions.svelte";
  import { getMatchingTags } from "$lib/utils/nostrUtils";
  import LazyImage from "$components/util/LazyImage.svelte";
  import { generateDarkPastelColor } from "$lib/utils/image_utils";

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

  let title: string = $derived(event.getMatchingTags("title")[0]?.[1]);
  let author: string = $derived(
    getMatchingTags(event, "author")[0]?.[1] ?? "unknown",
  );
  let image: string = $derived(event.getMatchingTags("image")[0]?.[1] ?? null);
  let authorPubkey: string = $derived(
    event.getMatchingTags("p")[0]?.[1] ?? null,
  );
  let hashtags: string = $derived(event.getMatchingTags("t") ?? null);

  function publishedAt() {
    const date = event.created_at ? new Date(event.created_at * 1000) : "";
    if (date !== "") {
      const formattedDate = new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "short",
        day: "2-digit",
      }).format(date);
      return formattedDate ?? "";
    }
    return "";
  }

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
    <div class="space-y-4 relative">
      <div class="flex flex-row justify-between my-2">
        <div class="flex flex-col">
          {@render userBadge(authorPubkey, author)}
          <span class="text-gray-700 dark:text-gray-300">{publishedAt()}</span>
        </div>
      </div>

      <div
        class="ArticleBoxImage flex justify-center items-center p-2 h-40 -mt-2"
        in:scale={{ start: 0.8, duration: 500, delay: 100, easing: quintOut }}
      >
        {#if image}
          <LazyImage 
            src={image} 
            alt={title || "Publication image"}
            eventId={event.id}
            className="rounded w-full h-full object-cover"
          />
        {:else}
          <div 
            class="rounded w-full h-full"
            style="background-color: {generateDarkPastelColor(event.id)};"
          >
          </div>
        {/if}
      </div>
      
      <div class="flex flex-col space-y-4">
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
      
      <!-- Position CardActions at bottom-right -->
      <div class="absolute bottom-2 right-2">
        <CardActions {event} />
      </div>
    </div>
  </Card>
{/if}
