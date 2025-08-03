<script lang="ts">
  import { Button, Modal, P } from "flowbite-svelte";
  import {
    HeartOutline,
    FilePenOutline,
    AnnotationOutline,
  } from "flowbite-svelte-icons";
  import ZapOutline from "$components/util/ZapOutline.svelte";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";
  import { onMount } from "svelte";
  import { ndkInstance } from "$lib/ndk";
  import { publicationColumnVisibility } from "$lib/stores";

  const {
    rootId,
    event,
    direction = "row",
  } = $props<{ rootId: string; event?: NDKEvent; direction?: string }>();

  // Reactive arrays to hold incoming events
  let likes: NDKEvent[] = [];
  let zaps: NDKEvent[] = [];
  let highlights: NDKEvent[] = [];
  let comments: NDKEvent[] = [];

  let interactionOpen: boolean = $state(false);

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
      "#a": [rootId], // Will this work?
    });

    sub.on("event", (evt: NDKEvent) => {
      // Only add if we haven't seen this event ID yet
      if (!targetArray.find((e) => e.id === evt.id)) {
        targetArray.push(evt);
      }
    });

    return sub;
  }

  let subs: any[] = [];

  onMount(() => {
    // Subscribe to each kind; store subs for cleanup
    subs.push(subscribeCount(7, likes)); // likes (Reaction)
    subs.push(subscribeCount(9735, zaps)); // zaps (Zap Receipts)
    subs.push(subscribeCount(30023, highlights)); // highlights (custom kind)
    subs.push(subscribeCount(1, comments)); // comments (Text Notes)
  });

  function showDiscussion() {
    publicationColumnVisibility.update((v) => {
      const updated = { ...v, discussion: true };
      // hide blog, unless the only column
      if (v.inner) {
        updated.blog = v.blog && window.innerWidth >= 1400;
      }
      return updated;
    });
  }

  function doLike() {
    interactionOpen = true;
  }
  function doHighlight() {
    interactionOpen = true;
  }
  function doZap() {
    interactionOpen = true;
  }
</script>

<div
  class="InteractiveMenu !hidden flex-{direction} justify-around align-middle text-primary-700 dark:text-gray-300"
>
  <Button
    color="none"
    class="flex flex-{direction} shrink-0 md:min-w-11 min-h-11 items-center p-0"
    onclick={doLike}
    ><HeartOutline class="mx-2" size="lg" /><span>{likeCount}</span></Button
  >
  <Button
    color="none"
    class="flex flex-{direction} shrink-0 md:min-w-11 min-h-11 items-center p-0"
    onclick={doZap}
    ><ZapOutline className="mx-2" /><span>{zapCount}</span></Button
  >
  <Button
    color="none"
    class="flex flex-{direction} shrink-0 md:min-w-11 min-h-11 items-center p-0"
    onclick={doHighlight}
    ><FilePenOutline class="mx-2" size="lg" /><span>{highlightCount}</span
    ></Button
  >
  <Button
    color="none"
    class="flex flex-{direction} shrink-0 md:min-w-11 min-h-11 items-center p-0"
    onclick={showDiscussion}
    ><AnnotationOutline class="mx-2" size="lg" /><span>{commentCount}</span
    ></Button
  >
</div>

<Modal
  class="modal-leather"
  title="Interaction"
  bind:open={interactionOpen}
  autoclose
  outsideclose
  size="sm"
>
  <P>Can't like, zap or highlight yet.</P>
  <P>You should totally check out the discussion though.</P>
</Modal>
