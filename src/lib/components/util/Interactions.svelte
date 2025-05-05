<script lang="ts">
  import { HeartOutline, FilePenOutline, AnnotationOutline } from 'flowbite-svelte-icons';
  import ZapOutline from "$components/util/ZapOutline.svelte";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";
  import { onMount } from "svelte";
  import { ndkInstance } from '$lib/ndk';

  const { rootId, event } = $props<{ rootId: string, event: NDKEvent  }>();

  // Reactive arrays to hold incoming events
  let likes: NDKEvent[] = [];
  let zaps: NDKEvent[] = [];
  let highlights: NDKEvent[] = [];
  let comments: NDKEvent[] = [];

  // Reactive counts derived from array lengths
  // Derived counts from store values
  const likeCount = $derived(likes.length);
  const zapCount = $derived(zaps.length);
  const highlightCount = $derived(highlights.length);
  const commentCount = $derived(comments.length);

  /**
   * Subscribe to Nostr events of a given kind that reference our root event via e-tag.
   * Push new events into the provided array if not already present.
   * Returns the subscription for later cleanup.
   */
  function subscribeCount(kind: number, targetArray: NDKEvent[]) {
    const sub = $ndkInstance.subscribe({
      kinds: [kind],
      '#a': [rootId]
    });


    sub.on('event', (evt: NDKEvent) => {
      // Only add if we haven't seen this event ID yet
      if (!targetArray.find(e => e.id === evt.id)) {
        targetArray.push(evt);
      }
    });

    return sub;
  }

  let subs: any[] = [];

  onMount(() => {
    // Subscribe to each kind; store subs for cleanup
    subs.push(subscribeCount(7, likes));        // likes (Reaction)
    subs.push(subscribeCount(9735, zaps));      // zaps (Zap Receipts)
    subs.push(subscribeCount(30023, highlights)); // highlights (custom kind)
    subs.push(subscribeCount(1, comments));     // comments (Text Notes)
  });

</script>

<div class='InteractiveMenu flex flex-row justify-around align-middle text-primary-600 dark:text-gray-500'>
  <div class='flex flex-row shrink-0 min-w-11'><HeartOutline size="lg" /><span>{likeCount}</span></div>
  <div class='flex flex-row shrink-0 min-w-11'><ZapOutline /><span>{zapCount}</span></div>
  <div class='flex flex-row shrink-0 min-w-11'><FilePenOutline size="lg"/><span>{highlightCount}</span></div>
  <div class='flex flex-row shrink-0 min-w-11'><AnnotationOutline size="lg"/><span>{commentCount}</span></div>
</div>