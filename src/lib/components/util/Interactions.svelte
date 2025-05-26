<script lang="ts">
  import { Button, Modal, P } from "flowbite-svelte";
  import {
    HeartOutline,
    FilePenOutline,
    AnnotationOutline,
  } from "flowbite-svelte-icons";
  import ZapOutline from "$components/util/ZapOutline.svelte";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";
  import { onMount, onDestroy } from "svelte";
  import { ndkInstance } from "$lib/ndk";
  import { publicationColumnVisibility } from "$lib/stores";
  import { get } from 'svelte/store';

  console.log('Interactions.svelte script loaded');

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

  // Convert counts to derived values
  let likeCount = $derived.by(() => likes.length);
  let zapCount = $derived.by(() => zaps.length);
  let highlightCount = $derived.by(() => highlights.length);
  let commentCount = $derived.by(() => comments.length);

  // Add a derived value for whether any interactions exist
  let hasInteractions = $derived.by(
    () =>
      likeCount > 0 || zapCount > 0 || highlightCount > 0 || commentCount > 0,
  );

  /**
   * Fetch and track Nostr events of a given kind that reference our root event via a-tag.
   * Push new events into the provided array if not already present.
   * Returns a cleanup function.
   */
  function subscribeCount(kind: number, targetArray: NDKEvent[]) {
    const instance = get(ndkInstance);
    console.log('NDK instance:', instance, 'Type:', instance?.constructor?.name);
    if (!instance) {
      console.error('NDK instance not initialized');
      return () => {};
    }

    // Fetch initial events
    instance.fetchEvents({
      kinds: [kind],
      '#a': [rootId],
    }).then((events) => {
      events.forEach((evt) => {
        if (!targetArray.find((e) => e.id === evt.id)) {
          targetArray = [...targetArray, evt];
        }
      });
    });

    // Set up a subscription for new events using the NDK subscription API
    const sub = instance.subscribe({
      kinds: [kind],
      '#a': [rootId],
    }, {
      closeOnEose: false,
      groupable: false,
    });

    sub.on('event', (evt: NDKEvent) => {
      if (!targetArray.find((e) => e.id === evt.id)) {
        targetArray = [...targetArray, evt];
      }
    });

    return () => {
      sub.stop();
    };
  }

  let subs: (() => void)[] = [];

  onMount(async () => {
    console.log('Interactions.svelte mounted');
    const instance = get(ndkInstance);
    if (!instance) {
      console.error('NDK instance not initialized');
      return;
    }

    try {
      // Connect to NDK if not already connected
      await instance.connect();
      
      // Subscribe to each kind; store cleanup functions
      subs.push(subscribeCount(7, likes)); // likes (Reaction)
      subs.push(subscribeCount(9735, zaps)); // zaps (Zap Receipts)
      subs.push(subscribeCount(30023, highlights)); // highlights (custom kind)
      subs.push(subscribeCount(1, comments)); // comments (Text Notes)
    } catch (error) {
      console.error('Failed to connect to NDK:', error);
    }
  });

  // Cleanup subscriptions on component destruction
  onDestroy(() => {
    subs.forEach(cleanup => cleanup());
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
  class="InteractiveMenu !hidden flex-{direction} justify-around align-middle text-primary-700 dark:text-gray-500"
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
