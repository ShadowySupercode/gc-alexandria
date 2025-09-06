<script lang="ts">
  import { naddrEncode, neventEncode } from "$lib/utils";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";
  import { activeInboxRelays, getNdkContext } from "$lib/ndk";
  import { Card } from "flowbite-svelte";
  import CardActions from "$components/util/CardActions.svelte";
  import { userBadge } from "$lib/snippets/UserSnippets.svelte";
  import LazyImage from "$components/util/LazyImage.svelte";
  import { generateDarkPastelColor } from "$lib/utils/image_utils";
  import { indexKind } from "$lib/consts";

  const { event } = $props<{ event: NDKEvent }>();

  const ndk = getNdkContext();

  function getRelayUrls(): string[] {
    return $activeInboxRelays;
  }

  const relays = $derived.by(() => {
    return getRelayUrls();
  });

  const href = $derived.by(() => {
    const dTag = event.getMatchingTags("d")[0]?.[1];
    const isIndexEvent = event.kind === indexKind;
    
    if (dTag != null && isIndexEvent) {
      // For index events with d tag, use naddr encoding
      const naddr = naddrEncode(event, relays);
      return `publication/naddr/${naddr}`;
    } else {
      // Fallback to d tag if available
      return dTag ? `publication/d/${dTag}` : null;
    }
  });

  let title: string = $derived(event.getMatchingTags("title")[0]?.[1]);
  let author: string = $derived(
    event.getMatchingTags("author")[0]?.[1] ?? "",
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
  <Card class="ArticleBox card-leather w-full h-48 flex flex-row space-x-2 relative">
    <div
      class="flex-shrink-0 w-40 h-40 overflow-hidden rounded flex items-center justify-center p-2 -mt-2"
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
    
    <div class="flex flex-col flex-grow min-w-0 overflow-hidden">
      <div class="flex flex-col flex-grow min-w-0 overflow-hidden">
        <a href="/{href}" class="flex flex-col space-y-2 h-full min-w-0 overflow-hidden">
          <div class="flex-grow pt-2 min-w-0 overflow-hidden">
            <h2 class="text-lg font-bold line-clamp-2 break-words overflow-hidden" {title}>{title}</h2>
            <h3 class="text-base font-normal mt-2 break-words overflow-hidden">
              by
              {#if authorPubkey != null}
                {@render userBadge(authorPubkey, author, ndk)}
              {:else}
                <span class="truncate">{@render userBadge(author, author, ndk)}</span>
              {/if}
            </h3>
          </div>
          {#if version != "1"}
            <h3 class="text-sm font-semibold text-primary-600 dark:text-primary-400 mt-auto break-words overflow-hidden">version: {version}</h3>
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
