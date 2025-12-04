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
  import { deleteEvent } from "$lib/services/deletion";

  const { event } = $props<{ event: NDKEvent }>();

  const ndk = getNdkContext();

  /**
   * Handle deletion of this publication
   */
  async function handleDelete() {
    const confirmed = confirm(
      "Are you sure you want to delete this publication? This action will publish a deletion request to all relays."
    );

    if (!confirmed) return;

    try {
      await deleteEvent({
        eventAddress: event.tagAddress(),
        eventKind: event.kind,
        reason: "User deleted publication",
        onSuccess: (deletionEventId) => {
          console.log("[PublicationHeader] Deletion event published:", deletionEventId);
          // Optionally refresh the feed or remove the card
          window.location.reload();
        },
        onError: (error) => {
          console.error("[PublicationHeader] Deletion failed:", error);
          alert(`Failed to delete publication: ${error}`);
        },
      }, ndk);
    } catch (error) {
      console.error("[PublicationHeader] Deletion error:", error);
    }
  }

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
    event.getMatchingTags("author")[0]?.[1] ?? "unknown",
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
  <Card class="ArticleBox max-h-52 card-leather w-full relative flex flex-col sm:flex-row sm:space-x-2 overflow-hidden">
    <!-- Image block: full width on mobile, fixed side on md+ -->
    <div class="w-full sm:min-w-40 sm:w-40 overflow-hidden flex items-center justify-center sm:rounded-l rounded-t sm:rounded-t-none">
      {#if image}
        <LazyImage
          src={image}
          alt={title || 'Publication image'}
          eventId={event.id}
          className="w-full h-full object-cover"
        />
      {:else}
        <div
          class="w-full h-full"
          style="background-color: {generateDarkPastelColor(event.id)};"
        ></div>
      {/if}
    </div>

    <!-- Content -->
    <div class="flex flex-col min-w-0 p-3 sm:p-2 w-full gap-2">
      <a href="/{href}" class="flex flex-col space-y-2 flex-1 min-w-0 overflow-hidden decoration-none hover:underline">
        <div class="min-w-0">
          <h2 class="text-lg font-bold line-clamp-2 break-words overflow-hidden decoration-none" {title}>{title}</h2>
          <h3 class="text-base font-normal mt-2 break-words overflow-hidden decoration-none">
            {#if authorPubkey != null}
              by {@render userBadge(authorPubkey, author, ndk)}
            {:else}
              <span class="line-clamp-1 inline">by {author}</span>
            {/if}
          </h3>
        </div>
      </a>
      <div class="flex flex-row w-full justify-between">
        {#if version != '1'}
          <h3 class="text-sm font-semibold text-primary-600 dark:text-primary-400 mt-auto break-words overflow-hidden">version: {version}</h3>
        {/if}
        <div class="flex ml-auto">
          <CardActions {event} onDelete={handleDelete} />
        </div>
      </div>
    </div>
  </Card>
{/if}
