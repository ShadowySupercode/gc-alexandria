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
    leaves: NDKEvent[],
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
  let leafContent: Promise<string | Document> = $derived.by(async () =>
    asciidoctor.convert((await leafEvent)?.content ?? ''));

  let previousLeafEvent: NDKEvent | null = $derived.by(() => {
    const index = leaves.findIndex(leaf => leaf.tagAddress() === address);
    if (index === 0) {
      return null;
    }
    return leaves[index - 1];
  });
  let previousLeafHierarchy: Promise<NDKEvent[] | null> = $derived.by(async () => {
    const previousLeaf = await previousLeafEvent;
    if (!previousLeaf) {
      return null;
    }
    return await publicationTree.getHierarchy(previousLeafEvent?.tagAddress() ?? '')
  });

  let divergingBranches = $derived.by(async () => {
    const currentHierarchy = await leafHierarchy;
    const previousHierarchy = await previousLeafHierarchy;
    
    const branches: [NDKEvent, number][] = [];

    if (!previousHierarchy) {
      for (let i = 0; i < currentHierarchy.length - 1; i++) {
        branches.push([currentHierarchy[i], i]);
      }
      return branches;
    }

    const minLength = Math.min(currentHierarchy.length, previousHierarchy.length);
    
    // Find the first diverging node.
    let divergingIndex = 0;
    while (
      divergingIndex < minLength && 
      currentHierarchy[divergingIndex].tagAddress() === previousHierarchy[divergingIndex].tagAddress()
    ) {
      divergingIndex++;
    }
    
    // Add all branches from the first diverging node to the current leaf.
    for (let i = divergingIndex; i < currentHierarchy.length - 1; i++) {
      branches.push([currentHierarchy[i], i]);
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

<!-- TODO: Correctly handle events that are the start of a content section. -->
<section bind:this={sectionRef}>
  {#await Promise.all([leafContent, publicationType, divergingBranches])}
    <TextPlaceholder size='xxl' />
  {:then [leafContent, publicationType, divergingBranches]}
    <!-- TODO: Ensure we render all headings, not just the first one. -->
    {#each divergingBranches as [branch, depth]}
      {@render sectionHeading(branch.getMatchingTags('title')[0]?.[1] ?? '', depth)}
    {/each}
    {@render contentParagraph(leafContent.toString(), publicationType ?? 'article', false)}
  {/await}
</section>

