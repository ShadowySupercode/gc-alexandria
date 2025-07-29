<script lang="ts">
  import { Button } from "flowbite-svelte";
  import { goto } from "$app/navigation";
  import type { NDKEvent } from "$lib/utils/nostrUtils";
  import { findContainingIndexEvents } from "$lib/utils/event_search";
  import { getMatchingTags } from "$lib/utils/nostrUtils";
  import { naddrEncode } from "$lib/utils";
  import { activeInboxRelays, activeOutboxRelays } from "$lib/ndk";

  let { event } = $props<{
    event: NDKEvent;
  }>();

  let containingIndexes = $state<NDKEvent[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let lastEventId = $state<string | null>(null);

  async function loadContainingIndexes() {
    console.log(
      "[ContainingIndexes] Loading containing indexes for event:",
      event.id,
    );
    loading = true;
    error = null;

    try {
      containingIndexes = await findContainingIndexEvents(event);
      console.log(
        "[ContainingIndexes] Found containing indexes:",
        containingIndexes.length,
      );
    } catch (err) {
      error =
        err instanceof Error
          ? err.message
          : "Failed to load containing indexes";
      console.error(
        "[ContainingIndexes] Error loading containing indexes:",
        err,
      );
    } finally {
      loading = false;
    }
  }

  function navigateToIndex(indexEvent: NDKEvent) {
    const dTag = getMatchingTags(indexEvent, "d")[0]?.[1];
    if (dTag) {
              goto(`/publication/d/${encodeURIComponent(dTag)}`);
    } else {
      // Fallback to naddr
      try {
        const naddr = naddrEncode(indexEvent, $activeInboxRelays);
        goto(`/publication/naddr/${encodeURIComponent(naddr)}`);
      } catch (err) {
        console.error("[ContainingIndexes] Error creating naddr:", err);
      }
    }
  }

  function getNaddrUrl(event: NDKEvent): string {
    return naddrEncode(event, $activeInboxRelays);
  }

  $effect(() => {
    // Only reload if the event ID has actually changed
    if (event.id !== lastEventId) {
      lastEventId = event.id;
      loadContainingIndexes();
    }
  });
</script>

{#if containingIndexes.length > 0 || loading || error}
  <div class="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border">
    <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
      Containing Publications
    </h4>

    {#if loading}
      <div class="text-sm text-gray-500 dark:text-gray-400">
        Loading containing publications...
      </div>
    {:else if error}
      <div class="text-sm text-red-600 dark:text-red-400">
        {error}
      </div>
    {:else if containingIndexes.length > 0}
      <div class="max-h-32 overflow-y-auto">
        {#each containingIndexes.slice(0, 3) as indexEvent}
          {@const title =
            getMatchingTags(indexEvent, "title")[0]?.[1] || "Untitled"}
          <Button
            size="xs"
            color="alternative"
            class="mb-1 mr-1 text-xs"
            onclick={() => navigateToIndex(indexEvent)}
          >
            {title}
          </Button>
        {/each}
        {#if containingIndexes.length > 3}
          <span class="text-xs text-gray-500 dark:text-gray-400">
            +{containingIndexes.length - 3} more
          </span>
        {/if}
      </div>
    {:else}
      <div class="text-sm text-gray-500 dark:text-gray-400">
        No containing publications found
      </div>
    {/if}
  </div>
{/if}
