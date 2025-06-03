<script lang="ts">
  import { getNostrClient } from "$lib/nostr/client";
  import { naddrEncode } from "$lib/utils/identifierUtils";
  import { getTagValue } from "$lib/utils/eventUtils";
  import type { NostrEvent } from "$lib/types/nostr";
  import { communityRelays } from "../../consts";
  import { Card } from "flowbite-svelte";
  import CardActions from "$components/util/CardActions.svelte";
  import { userBadge } from "$lib/snippets/UserSnippets.svelte";
  import { formatTimestampToDate } from "$lib/utils";
  import CardImage from "./CardImage.svelte";
  
  let { event, warnings = [] }: { event: NostrEvent, warnings?: string[] } = $props();

  const activeUser = getNostrClient().getActiveUser();

  const relays = $derived.by(
    () => activeUser?.relayUrls ?? communityRelays,
  );

  const href = $derived.by(() => {
    const dTag = event.tags.find(tag => tag[0] === 'd')?.[1];
    if (!dTag) {
      return null;
    }
    console.log('Event tags:', event.tags);
    console.log('DTag:', dTag);
    console.log('Event kind:', event.kind);
    console.log('Event pubkey:', event.pubkey);
    const naddrData = {
      kind: event.kind,
      pubkey: event.pubkey,
      tags: [['d', dTag]],
      content: '',
      created_at: event.created_at,
      id: event.id,
      sig: event.sig
    };
    console.log('Naddr data:', naddrData);
    return `publication?id=${naddrEncode(naddrData, relays)}`;
  });

  let showActions = $state(false);

  const eventMetadata = {
    title: getTagValue(event, 'title') || "Untitled",
    author: getTagValue(event, 'author') || "Unknown Author",
    type: (getTagValue(event, 'type') || "book").toLowerCase(),
    summary: getTagValue(event, 'summary') || "",
    publishedAt: formatTimestampToDate(event.created_at),
  };

  let showSummary = $derived.by(() => eventMetadata.summary.length > 0);

  let showActionsPanel = $derived.by(
    () => showActions && eventMetadata.title !== "Untitled",
  );

  let tags = Array.isArray(event.tags)
    ? event.tags
    : Array.from(event.tags ?? []);

  console.log("PublicationHeader event:", {
    id: event.id,
    kind: event.kind,
    tagsLength: tags.length,
    tags,
    contentLength: event.content?.length,
    content: event.content?.slice?.(0, 200),
  });
</script>

{#if eventMetadata.title != null && href != null}
  <Card
    class="ArticleBox card-leather w-full max-w-md flex flex-col space-y-2 min-h-96 h-72"
    onmouseenter={() => (showActions = true)}
    onmouseleave={() => (showActions = false)}
    aria-label="Publication card"
  >
    <CardImage
      imageUrl={getTagValue(event, 'image')}
      title={eventMetadata.title}
    />
    <div class="flex flex-row flex-1">
      <div class="flex flex-col flex-grow h-full">
        <a href="/{href}" class="flex flex-col h-full">
          <div class="flex flex-col space-y-2">
            <h2
              class="text-lg font-bold line-clamp-2"
              title={getTagValue(event, 'title') || "Untitled"}
            >
              {getTagValue(event, 'title') || "Untitled"}
            </h2>
            <h3 class="text-base font-normal flex items-center gap-2">
              by
              {#if getTagValue(event, 'p')}
                {@render userBadge(
                  getTagValue(event, 'p') || '',
                  eventMetadata.author || '',
                )}
              {:else}
                {eventMetadata.author}
              {/if}
              {#if warnings.length > 0}
                <span class="text-yellow-500 cursor-help" title={warnings.join('\n')}>
                  ⚠️
                </span>
              {/if}
            </h3>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              {getTagValue(event, 'published_on') || eventMetadata.publishedAt}
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
