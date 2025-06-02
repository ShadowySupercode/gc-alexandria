<script lang="ts">
  import type { PublicationTree } from "$lib/data_structures/publication_tree";
  import {
    contentParagraph,
    sectionHeading,
  } from "$lib/snippets/PublicationSnippets.svelte";
  import { TextPlaceholder } from "flowbite-svelte";
  import { getContext } from "svelte";
  import type { Asciidoctor, Document } from "asciidoctor";
  import type { NostrEvent } from '$lib/types/nostr';
  import { getTagAddress } from '$lib/utils/eventUtils';

  let {
    address,
    rootAddress,
    leaves,
    ref,
  }: {
    address: string;
    rootAddress: string;
    leaves: Array<NostrEvent | null>;
    ref: (ref: HTMLElement) => void;
  } = $props();

  const publicationTree: PublicationTree = getContext("publicationTree");
  const asciidoctor: Asciidoctor = getContext("asciidoctor");

  let leafEvent: Promise<NostrEvent | null> = $derived.by(
    async () => await publicationTree.getEvent(address),
  );

  let rootEvent: Promise<NostrEvent | null> = $derived.by(
    async () => await publicationTree.getEvent(rootAddress),
  );

  let publicationType: Promise<string | undefined> = $derived.by(async () => {
    const event = await rootEvent;
    return event ? getTagValue(event, 'type') : undefined;
  });

  let leafHierarchy: Promise<NostrEvent[]> = $derived.by(
    async () => await publicationTree.getHierarchy(address),
  );

  let leafTitle: Promise<string | undefined> = $derived.by(async () => {
    const event = await leafEvent;
    return event ? getTagValue(event, 'title') : undefined;
  });

  let leafContent: Promise<string | Document> = $derived.by(async () =>
    asciidoctor.convert((await leafEvent)?.content ?? ""),
  );

  let previousLeafEvent: NostrEvent | null = $derived.by(() => {
    let index: number;
    let event: NostrEvent | null = null;
    let decrement = 1;

    do {
      index = leaves.findIndex((leaf) => leaf && getTagAddress(leaf) === address);
      if (index === 0) {
        return null;
      }
      event = leaves[index - decrement++];
    } while (event == null && index - decrement >= 0);

    return event;
  });

  let previousLeafHierarchy: Promise<NostrEvent[] | null> = $derived.by(
    async () => {
      if (!previousLeafEvent) {
        return null;
      }
      return await publicationTree.getHierarchy(getTagAddress(previousLeafEvent));
    },
  );

  let divergingBranches = $derived.by(async () => {
    let [leafHierarchyValue, previousLeafHierarchyValue] = await Promise.all([
      leafHierarchy,
      previousLeafHierarchy,
    ]);

    const branches: [NostrEvent, number][] = [];

    if (!previousLeafHierarchyValue) {
      for (let i = 0; i < leafHierarchyValue.length - 1; i++) {
        branches.push([leafHierarchyValue[i], i]);
      }
      return branches;
    }

    const minLength = Math.min(
      leafHierarchyValue.length,
      previousLeafHierarchyValue.length,
    );

    // Find the first diverging node.
    let divergingIndex = 0;
    while (
      divergingIndex < minLength &&
      getTagAddress(leafHierarchyValue[divergingIndex]) ===
        getTagAddress(previousLeafHierarchyValue[divergingIndex])
    ) {
      divergingIndex++;
    }

    // Add all branches from the first diverging node to the current leaf.
    for (let i = divergingIndex; i < leafHierarchyValue.length - 1; i++) {
      branches.push([leafHierarchyValue[i], i]);
    }

    return branches;
  });

  let sectionRef: HTMLElement;

  $effect(() => {
    if (!sectionRef) {
      return;
    }

    ref(sectionRef);
  });

  /**
   * Gets the first matching tag value for a given tag name from a NostrEvent.
   */
  function getTagValue<T = string>(event: NostrEvent, tagName: string): T | undefined {
    const matches = event.tags.filter((tag) => tag[0] === tagName);
    if (matches.length > 1) {
      // Do not throw; just return the first value
      return matches[0]?.[1] as T | undefined;
    }
    return matches[0]?.[1] as T | undefined;
  }
</script>

<section
  id={address}
  bind:this={sectionRef}
  class="publication-leather content-visibility-auto"
>
  {#await Promise.all( [leafTitle, leafContent, leafHierarchy, publicationType, divergingBranches], )}
    <TextPlaceholder size="xxl" />
  {:then [leafTitle, leafContent, leafHierarchy, publicationType, divergingBranches]}
    {#each divergingBranches as [branch, depth]}
      {@render sectionHeading(getTagValue(branch, 'title') ?? "", depth)}
    {/each}
    {#if leafTitle}
      {@const leafDepth = leafHierarchy.length - 1}
      {@render sectionHeading(leafTitle, leafDepth)}
    {/if}
    {@render contentParagraph(
      leafContent.toString(),
      publicationType ?? "article",
      false,
    )}
  {/await}
</section>
