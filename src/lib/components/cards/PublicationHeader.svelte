<script lang="ts">
  import { getActiveUser } from "$lib/ndk";
  import { naddrEncode } from "$lib/utils";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";
  import { communityRelays } from "../../consts.ts";
  import { Card } from "flowbite-svelte";
  import CardActions from "$components/util/CardActions.svelte";
  import { userBadge } from "$lib/snippets/UserSnippets.svelte";
  import { formatTimestampToDate } from "$lib/utils/dateUtils.ts";
  import CardImage from "./CardImage.svelte";
  
  let { event, warnings = [] }: { event: NDKEvent, warnings?: string[] } = $props();

  const relays = $derived.by(
    () => getActiveUser()?.relayUrls ?? communityRelays,
  );

  const href = $derived.by(() => {
    const d = event.getTagValue("d");
    if (d != null) {
      return `publication?d=${d}`;
    } else {
      return `publication?id=${naddrEncode(event, relays)}`;
    }
  });

  let showActions = $state(false);

  const eventMetadata = {
    title: event.getTagValue("title") || "Untitled",
    author: event.getTagValue("author") || "Unknown Author",
    type: (event.getTagValue("type") || "book").toLowerCase(),
    summary: event.getTagValue("summary") || "",
    publishedAt: formatTimestampToDate(event.created_at),
  };

  let showSummary = $derived.by(() => eventMetadata.summary.length > 0);

  let showActionsPanel = $derived.by(
    () => showActions && eventMetadata.title !== "Untitled",
  );

  console.log("PublicationHeader event:", event);
</script>

{#if eventMetadata.title != null && href != null}
  <Card
    class="ArticleBox card-leather w-full max-w-md flex flex-col space-y-2 min-h-96 h-72"
    onmouseenter={() => (showActions = true)}
    onmouseleave={() => (showActions = false)}
    aria-label="Publication card"
  >
    <CardImage
      imageUrl={event.getTagValue("image")}
      title={eventMetadata.title}
    />
    <div class="flex flex-row flex-1">
      <div class="flex flex-col flex-grow h-full">
        <a href="/{href}" class="flex flex-col h-full">
          <div class="flex flex-col space-y-2">
            <h2
              class="text-lg font-bold line-clamp-2"
              title={event.getTagValue("title") || "Untitled"}
            >
              {event.getTagValue("title") || "Untitled"}
            </h2>
            <h3 class="text-base font-normal flex items-center gap-2">
              by
              {#if event.getTagValue("p")}
                {@render userBadge(
                  event.getTagValue("p") || '',
                  eventMetadata.author || '',
                )}
              {:else}
                {eventMetadata.author}
              {/if}
              {#if warnings.length > 0}
                <span class="text-yellow-500" title={warnings.join('\n')}>
                  ⚠️
                </span>
              {/if}
            </h3>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              {event.getTagValue("published_on") || eventMetadata.publishedAt}
            </p>
            <div class="text-xs text-primary-800 dark:text-primary-200 mb-1">
              type: {eventMetadata.type}
            </div>
            {#if showSummary}
              <p
                class="mt-2 text-gray-700 dark:text-gray-300 line-clamp-4"
                title={eventMetadata.summary}
              >
                {eventMetadata.summary}
              </p>
            {/if}
          </div>

          <div class="flex-grow"></div>
        </a>
      </div>
      <div class="flex flex-col justify-start items-center min-w-9">
        {#if showActionsPanel}
          {#if eventMetadata.title !== "Untitled"}
            <CardActions {event} />
          {/if}
        {/if}
      </div>
    </div>
  </Card>
{/if}
