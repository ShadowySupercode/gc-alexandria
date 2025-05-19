<script lang='ts'>
  import type { PublicationTree } from "$lib/data_structures/publication_tree";
  import { contentParagraph, sectionHeading } from "$lib/snippets/PublicationSnippets.svelte";
  import { NDKEvent } from "@nostr-dev-kit/ndk";
  import { TextPlaceholder } from "flowbite-svelte";
  import { getContext } from "svelte";
  import type { Asciidoctor, Document } from "asciidoctor";

  let {
    address,
    rootAddress,
    leaves,
    ref,
  }: {
    address: string,
    rootAddress: string,
    leaves: Array<NDKEvent | null>,
    ref: (ref: HTMLElement) => void,
  } = $props();

  const publicationTree: PublicationTree = getContext('publicationTree');
  const asciidoctor: Asciidoctor = getContext('asciidoctor');

  let leafEvent: Promise<NDKEvent | null> = $derived.by(async () => 
    await publicationTree.getEvent(address));

  let rootEvent: Promise<NDKEvent | null> = $derived.by(async () =>
    await publicationTree.getEvent(rootAddress));

  let publicationType: Promise<string | undefined> = $derived.by(async () =>
    (await rootEvent)?.getMatchingTags('type')[0]?.[1]);

  let leafHierarchy: Promise<NDKEvent[]> = $derived.by(async () =>
    await publicationTree.getHierarchy(address));

  let leafTitle: Promise<string | undefined> = $derived.by(async () =>
    (await leafEvent)?.getMatchingTags('title')[0]?.[1]);

  let leafContent: Promise<string | Document> = $derived.by(async () =>
    asciidoctor.convert((await leafEvent)?.content ?? ''));

  let previousLeafEvent: NDKEvent | null = $derived.by(() => {
    let index: number;
    let event: NDKEvent | null = null;
    let decrement = 1;

    do {
      index = leaves.findIndex(leaf => leaf?.tagAddress() === address);
      if (index === 0) {
        return null;
      }
      event = leaves[index - decrement++];
    } while (event == null && index - decrement >= 0);

    return event;
  });

  let previousLeafHierarchy: Promise<NDKEvent[] | null> = $derived.by(async () => {
    if (!previousLeafEvent) {
      return null;
    }
    return await publicationTree.getHierarchy(previousLeafEvent.tagAddress());
  });

  let divergingBranches = $derived.by(async () => {
    let [leafHierarchyValue, previousLeafHierarchyValue] = await Promise.all([leafHierarchy, previousLeafHierarchy]);
    
    const branches: [NDKEvent, number][] = [];

    if (!previousLeafHierarchyValue) {
      for (let i = 0; i < leafHierarchyValue.length - 1; i++) {
        branches.push([leafHierarchyValue[i], i]);
      }
      return branches;
    }

    const minLength = Math.min(leafHierarchyValue.length, previousLeafHierarchyValue.length);
    
    // Find the first diverging node.
    let divergingIndex = 0;
    while (
      divergingIndex < minLength && 
      leafHierarchyValue[divergingIndex].tagAddress() === previousLeafHierarchyValue[divergingIndex].tagAddress()
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
</script>

<section id={address} bind:this={sectionRef} class='publication-leather content-visibility-auto'>
  {#await Promise.all([leafTitle, leafContent, leafHierarchy, publicationType, divergingBranches])}
    <TextPlaceholder size='xxl' />
  {:then [leafTitle, leafContent, leafHierarchy, publicationType, divergingBranches]}
    {#each divergingBranches as [branch, depth]}
      {@render sectionHeading(branch.getMatchingTags('title')[0]?.[1] ?? '', depth)}
    {/each}
    {#if leafTitle}
      {@const leafDepth = leafHierarchy.length - 1}
      {@render sectionHeading(leafTitle, leafDepth)}
    {/if}
    {@render contentParagraph(leafContent.toString(), publicationType ?? 'article', false)}
  {/await}
</section>
