<script lang="ts">
  import { Card } from "flowbite-svelte";
  import { onMount } from "svelte";
  import { userBadge } from "$lib/snippets/UserSnippets.svelte";
  import { toNpub } from '$lib/utils';
  import type { NostrEvent } from '$lib/types/nostr';
  import DualPill from "$components/util/DualPill.svelte";
  import { formatTimestampToDate } from "$lib/utils";
  import LightBox from "$components/cards/partial/LightBox.svelte";
  import { extractImageMeta, type ImageMeta } from "$lib/utils";

  const { event, typeDisplay, content } = $props<{
    event: NostrEvent;
    typeDisplay: any;
    content?: string | null;
  }>();

  let images: ImageMeta[] = $state([]);

  onMount(() => {
    images = extractImageMeta(event.tags);
  });

</script>

<Card class="ArticleBox card-leather w-full max-w-2xl">
  <div class="space-y-4">
    <div class="flex flex-row justify-between items-center">
      <div class="flex flex-col">
        {@render userBadge(
          toNpub(event.pubkey) as string, event.pubkey
          )}
        <span class="text-xs text-gray-500"
        >{formatTimestampToDate(event.created_at)}</span>
      </div>
      <DualPill left={event.kind} right={typeDisplay} />
    </div>
    <LightBox {images} />
    <div class="text-base">
      {@html content}
    </div>
  </div>
</Card>
