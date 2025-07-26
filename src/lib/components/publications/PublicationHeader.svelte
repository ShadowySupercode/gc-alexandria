<script lang="ts">
  import { naddrEncode } from "$lib/utils";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";
  import { activeInboxRelays } from "$lib/ndk";
  import { Card } from "flowbite-svelte";
  import CardActions from "$components/util/CardActions.svelte";
  import { userBadge } from "$lib/snippets/UserSnippets.svelte";
  import LazyImage from "$components/util/LazyImage.svelte";
  import { generateDarkPastelColor } from "$lib/utils/image_utils";

  const { event } = $props<{ event: NDKEvent }>();

  function getRelayUrls(): string[] {
    return $activeInboxRelays;
  }

  const relays = $derived.by(() => {
    return getRelayUrls();
  });

  const href = $derived.by(() => {
    const d = event.getMatchingTags("d")[0]?.[1];
    if (d != null) {
      return `publication?d=${encodeURIComponent(d)}`;
    } else {
      return `publication?id=${naddrEncode(event, relays)}`;
    }
  });

  let title: string = $derived(event.getMatchingTags("title")[0]?.[1]);
  let author: string = $derived(
    event.getMatchingTags(event, "author")[0]?.[1] ?? "unknown",
  );
  let version: string = $derived(
    event.getMatchingTags("version")[0]?.[1] ?? "1",
  );
  let image: string = $derived(event.getMatchingTags("image")[0]?.[1] ?? null);
  let authorPubkey: string = $derived(
    event.getMatchingTags("p")[0]?.[1] ?? null,
  );
</script>

{#if title != null && href != null}
  <Card class="ArticleBox card-leather max-w-md h-48 flex flex-row space-x-2 relative">
    <div
      class="flex-shrink-0 w-32 h-40 overflow-hidden rounded flex items-center justify-center p-2 -mt-2"
    >
      {#if image}
        <LazyImage 
          src={image} 
          alt={title || "Publication image"}
          eventId={event.id}
          className="w-full h-full object-cover"
        />
      {:else}
        <div 
          class="w-full h-full rounded"
          style="background-color: {generateDarkPastelColor(event.id)};"
        >
        </div>
      {/if}
    </div>
    
    <div class="flex flex-col flex-grow space-x-2">
      <div class="flex flex-col flex-grow">
        <a href="/{href}" class="flex flex-col space-y-2 h-full">
          <div class="flex-grow pt-2">
            <h2 class="text-lg font-bold line-clamp-2" {title}>{title}</h2>
            <h3 class="text-base font-normal mt-2">
              by
              {#if authorPubkey != null}
                {@render userBadge(authorPubkey, author)}
              {:else}
                {author}
              {/if}
            </h3>
          </div>
          {#if version != "1"}
            <h3 class="text-sm font-semibold text-primary-600 dark:text-primary-400 mt-auto">version: {version}</h3>
          {/if}
        </a>
      </div>
    </div>
    
    <!-- Position CardActions at bottom-right -->
    <div class="absolute bottom-2 right-2">
      <CardActions {event} />
    </div>
  </Card>
{/if}
