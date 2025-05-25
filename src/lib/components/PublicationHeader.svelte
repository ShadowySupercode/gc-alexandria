<script lang="ts">
  import { ndkInstance } from "$lib/ndk";
  import { naddrEncode } from "$lib/utils";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";
  import { standardRelays } from "../consts";
  import { Card, Img } from "flowbite-svelte";
  import CardActions from "$components/util/CardActions.svelte";
  import { userBadge } from "$lib/snippets/UserSnippets.svelte";

  const { event } = $props<{ event: NDKEvent }>();

  const relays = $derived.by(
    () => $ndkInstance.activeUser?.relayUrls ?? standardRelays,
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
    author: event.getTagValue("author") || "Unknown",
    type: event.getTagValue("type") || "Book",
    publishedAt: event.created_at
      ? new Date(event.created_at * 1000).toLocaleDateString()
      : "Unknown Date",
  };

  let displayType = $derived.by(() => {
    const type = eventMetadata.type.toLowerCase();
    switch (type) {
      case "book":
        return "Book";
      case "illustrated":
        return "Illustrated Book";
      case "magazine":
        return "Magazine";
      case "documentation":
        return "Documentation";
      case "academic":
        return "Academic Paper";
      case "blog":
        return "Blog Post";
      default:
        return type.charAt(0).toUpperCase() + type.slice(1);
    }
  });

  let showActionsPanel = $derived.by(
    () => showActions && eventMetadata.title !== "Untitled",
  );

  console.log("PublicationHeader event:", event);
</script>

{#if eventMetadata.title != null && href != null}
  <Card
    class="ArticleBox card-leather w-full max-w-md flex flex-row items-stretch space-x-4 min-h-36"
    on:mouseenter={() => (showActions = true)}
    on:mouseleave={() => (showActions = false)}
  >
    {#if event.getTagValue("image") != null}
      <div
        class="flex flex-col justify-center items-center flex-shrink-0 w-24 h-36 overflow-hidden"
      >
        <Img
          src={event.getTagValue("image")}
          class="rounded w-full h-full object-cover"
        />
      </div>
    {/if}
    <div class="flex flex-col flex-grow justify-between py-2">
      <a href="/{href}" class="flex flex-col space-y-2 h-full">
        <h2 class="text-lg font-bold line-clamp-2" title={eventMetadata.title}>
          {eventMetadata.title}
        </h2>
        <h3 class="text-base font-normal flex items-center gap-2">
          by
          {#if event.getTagValue("p") != null}
            {@render userBadge(event.getTagValue("p"), eventMetadata.author)}
          {:else}
            {eventMetadata.author}
          {/if}
        </h3>
        <p class="text-gray-600 dark:text-gray-400">
          {eventMetadata.publishedAt}
        </p>
        <p class="text-sm text-gray-500 mt-1">Type: {displayType}</p>
      </a>
    </div>
    {#if showActionsPanel}
      <div class="flex flex-col justify-start items-center self-start pt-2">
        <CardActions {event} />
      </div>
    {/if}
  </Card>
{/if}
