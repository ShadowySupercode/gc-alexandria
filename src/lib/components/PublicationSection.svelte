<script lang="ts">
  import type { PublicationTree } from "$lib/data_structures/publication_tree";
  import {
    contentParagraph,
    sectionHeading,
  } from "$lib/snippets/PublicationSnippets.svelte";
  import { NDKEvent } from "@nostr-dev-kit/ndk";
  import { TextPlaceholder } from "flowbite-svelte";
  import { getContext } from "svelte";
  import type { Asciidoctor, Document } from "asciidoctor";
  import { getMatchingTags } from "$lib/utils/nostrUtils";
  import { postProcessAdvancedAsciidoctorHtml } from "$lib/utils/markup/advancedAsciidoctorPostProcessor";
  import { goto } from '$app/navigation';

  let {
    address,
    rootAddress,
    leaves,
    ref,
  }: {
    address: string;
    rootAddress: string;
    leaves: Array<NDKEvent | null>;
    ref: (ref: HTMLElement) => void;
  } = $props();

  console.debug(`[PublicationSection] Received address: ${address}`);
  console.debug(`[PublicationSection] Root address: ${rootAddress}`);
  console.debug(`[PublicationSection] Leaves count: ${leaves.length}`);

  const publicationTree: PublicationTree = getContext("publicationTree");
  const asciidoctor: Asciidoctor = getContext("asciidoctor");

  let leafEvent: Promise<NDKEvent | null> = $derived.by(
    async () => {
      console.debug(`[PublicationSection] Getting event for address: ${address}`);
      const event = await publicationTree.getEvent(address);
      console.debug(`[PublicationSection] Retrieved event: ${event?.id}`);
      return event;
    },
  );

  let rootEvent: Promise<NDKEvent | null> = $derived.by(
    async () => await publicationTree.getEvent(rootAddress),
  );

  let publicationType: Promise<string | undefined> = $derived.by(
    async () => (await rootEvent)?.getMatchingTags("type")[0]?.[1],
  );

  let leafHierarchy: Promise<NDKEvent[]> = $derived.by(
    async () => await publicationTree.getHierarchy(address),
  );

  let leafTitle: Promise<string | undefined> = $derived.by(
    async () => (await leafEvent)?.getMatchingTags("title")[0]?.[1],
  );

  let leafContent: Promise<string | Document> = $derived.by(async () => {
    const rawContent = (await leafEvent)?.content ?? "";
    const asciidoctorHtml = asciidoctor.convert(rawContent);
    return await postProcessAdvancedAsciidoctorHtml(asciidoctorHtml.toString());
  });

  let leafHashtags: Promise<string[]> = $derived.by(
    async () => (await leafEvent)?.getMatchingTags("t").map((tag: string[]) => tag[1]) ?? [],
  );

  let previousLeafEvent: NDKEvent | null = $derived.by(() => {
    let index: number;
    let event: NDKEvent | null = null;
    let decrement = 1;

    do {
      index = leaves.findIndex((leaf) => leaf?.tagAddress() === address);
      if (index === 0) {
        return null;
      }
      event = leaves[index - decrement++];
    } while (event == null && index - decrement >= 0);

    return event;
  });

  let previousLeafHierarchy: Promise<NDKEvent[] | null> = $derived.by(
    async () => {
      if (!previousLeafEvent) {
        return null;
      }
      return await publicationTree.getHierarchy(previousLeafEvent.tagAddress());
    },
  );

  let divergingBranches = $derived.by(async () => {
    let [leafHierarchyValue, previousLeafHierarchyValue] = await Promise.all([
      leafHierarchy,
      previousLeafHierarchy,
    ]);

    const branches: [NDKEvent, number][] = [];

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
      leafHierarchyValue[divergingIndex].tagAddress() ===
        previousLeafHierarchyValue[divergingIndex].tagAddress()
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

  function navigateToHashtagSearch(tag: string): void {
    const encoded = encodeURIComponent(tag);
    goto(`/events?t=${encoded}`, {
      replaceState: false,
      keepFocus: true,
      noScroll: true,
    });
  }

  $effect(() => {
    if (!sectionRef) {
      return;
    }

    ref(sectionRef);
  });



</script>

<section
  id={address}
  bind:this={sectionRef}
  class="publication-leather content-visibility-auto"
>
  {#await Promise.all( [leafTitle, leafContent, leafHierarchy, publicationType, divergingBranches, leafEvent, leafHashtags], )}
    <TextPlaceholder size="xxl" />
  {:then [leafTitle, leafContent, leafHierarchy, publicationType, divergingBranches, resolvedLeafEvent, hashtags]}
    {@const contentString = leafContent.toString()}
    

    
    {#each divergingBranches as [branch, depth]}
      {@render sectionHeading(
        getMatchingTags(branch, "title")[0]?.[1] ?? "",
        depth,
      )}
    {/each}
    {#if leafTitle}
      {@const leafDepth = leafHierarchy.length - 1}
      {@render sectionHeading(leafTitle, leafDepth)}
    {/if}
    {@render contentParagraph(
      contentString,
      publicationType ?? "article",
      false,
    )}
    {#if hashtags.length > 0}
      <div class="tags my-2 flex flex-wrap gap-1">
        {#each hashtags as tag (tag)}
          <button
            class="text-sm text-primary-600 dark:text-primary-500 hover:text-primary-800 dark:hover:text-primary-300 hover:underline cursor-pointer"
            onclick={(e: MouseEvent) => {
              e.stopPropagation();
              navigateToHashtagSearch(tag);
            }}
          >
            #{tag}
          </button>
        {/each}
      </div>
    {/if}
  {/await}
</section>
