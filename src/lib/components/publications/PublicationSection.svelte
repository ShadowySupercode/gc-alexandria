<script lang="ts">
  import {
    contentParagraph,
    sectionHeading,
  } from "$lib/snippets/PublicationSnippets.svelte";
  import { NDKEvent } from "@nostr-dev-kit/ndk";
  import { TextPlaceholder } from "flowbite-svelte";
  import { getContext } from "svelte";
  import type { Asciidoctor, Document } from "asciidoctor";
  import { getMatchingTags } from "$lib/utils/nostrUtils";
  import type { SveltePublicationTree } from "./svelte_publication_tree.svelte";
  import type { TableOfContents as TocType } from "./table_of_contents.svelte";
  import { postProcessAdvancedAsciidoctorHtml } from "$lib/utils/markup/advancedAsciidoctorPostProcessor";
  import { parseAdvancedmarkup } from "$lib/utils/markup/advancedMarkupParser";
  import NDK from "@nostr-dev-kit/ndk";
  import CardActions from "$components/util/CardActions.svelte";
  import SectionComments from "./SectionComments.svelte";
  import { deleteEvent } from "$lib/services/deletion";

  let {
    address,
    rootAddress,
    leaves,
    publicationTree,
    toc,
    ref,
    allComments = [],
    commentsVisible = true,
    publicationTitle,
    isFirstSection = false,
  }: {
    address: string;
    rootAddress: string;
    leaves: Array<NDKEvent | null>;
    publicationTree: SveltePublicationTree;
    toc: TocType;
    ref: (ref: HTMLElement) => void;
    allComments?: NDKEvent[];
    commentsVisible?: boolean;
    publicationTitle?: string;
    isFirstSection?: boolean;
  } = $props();

  const asciidoctor: Asciidoctor = getContext("asciidoctor");
  const ndk: NDK = getContext("ndk");

  // Filter comments for this section
  let sectionComments = $derived(
    allComments.filter((comment) => {
      // Check if comment targets this section via #a tag
      const aTag = comment.tags.find((t) => t[0] === "a");
      return aTag && aTag[1] === address;
    }),
  );

  let leafEvent: Promise<NDKEvent | null> = $derived.by(
    async () => await publicationTree.getEvent(address),
  );

  let leafEventId = $state<string>("");

  $effect(() => {
    leafEvent.then((e) => {
      if (e?.id) {
        leafEventId = e.id;
      }
    });
  });

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
    const event = await leafEvent;
    const content = event?.content ?? "";

    // AI-NOTE: Kind 30023 events contain Markdown content, not AsciiDoc
    // Use parseAdvancedmarkup for 30023 events, Asciidoctor for 30041/30818 events
    let processed: string;
    if (event?.kind === 30023) {
      processed = await parseAdvancedmarkup(content);
    } else {
      // For 30041 and 30818 events, use Asciidoctor (AsciiDoc)
      const converted = asciidoctor.convert(content);
      processed = await postProcessAdvancedAsciidoctorHtml(
        converted.toString(),
        ndk,
      );
    }
    
    // Remove redundant h1 title from first section if it matches publication title
    if (isFirstSection && publicationTitle && typeof processed === 'string') {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = processed;
      const h1Elements = tempDiv.querySelectorAll('h1');
      h1Elements.forEach((h1) => {
        if (h1.textContent?.trim() === publicationTitle.trim()) {
          h1.remove();
        }
      });
      processed = tempDiv.innerHTML;
    }
    
    return processed;
  });

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

  /**
   * Handle deletion of this section
   */
  async function handleDelete() {
    const event = await leafEvent;
    if (!event) return;

    const confirmed = confirm(
      "Are you sure you want to delete this section? This action will publish a deletion request to all relays.",
    );

    if (!confirmed) return;

    try {
      await deleteEvent(
        {
          eventAddress: address,
          eventKind: event.kind,
          reason: "User deleted section",
          onSuccess: () => {
            // Refresh the page to reflect the deletion
            window.location.reload();
          },
          onError: (error) => {
            console.error("[PublicationSection] Deletion failed:", error);
            alert(`Failed to delete section: ${error}`);
          },
        },
        ndk,
      );
    } catch (error) {
      console.error("[PublicationSection] Deletion error:", error);
    }
  }

  $effect(() => {
    if (!sectionRef) {
      return;
    }

    ref(sectionRef);
  });
</script>

<!-- Wrapper for positioning context -->
<div class="relative w-full overflow-x-hidden">
  <section
    id={address}
    bind:this={sectionRef}
    class="publication-leather content-visibility-auto section-with-comment"
    data-event-address={address}
    data-event-id={leafEventId}
  >
    {#await Promise.all( [leafTitle, leafContent, leafHierarchy, publicationType, divergingBranches], )}
      <TextPlaceholder size="2xl" />
    {:then [leafTitle, leafContent, leafHierarchy, publicationType, divergingBranches]}
      <!-- Main content area - left-aligned -->
      <div class="section-content relative w-full text-left">
        {#each divergingBranches as [branch, depth]}
          {@render sectionHeading(
            getMatchingTags(branch, "title")[0]?.[1] ?? "",
            depth,
          )}
        {/each}
        {#if leafTitle}
          {@const leafDepth = leafHierarchy.length - 1}
          <div class="relative">
            <!-- Section actions button - positioned next to heading -->
            <div class="absolute top-0 right-0 z-20">
              {#await leafEvent then event}
                {#if event}
                  <CardActions
                    {event}
                    sectionAddress={address}
                    onDelete={handleDelete}
                  />
                {/if}
              {/await}
            </div>
            {@render sectionHeading(leafTitle, leafDepth)}
          </div>
        {/if}
        {@render contentParagraph(
          leafContent.toString(),
          publicationType ?? "article",
          false,
        )}
      </div>

      <!-- Mobile comments - shown below content on smaller screens -->
      <div class="xl:hidden mt-8 w-full text-left">
        <SectionComments
          sectionAddress={address}
          comments={sectionComments}
          visible={commentsVisible}
        />
      </div>
    {/await}
  </section>


  <!-- Comments area: positioned below menu, top-center of section -->
  <div
    class="hidden xl:block absolute left-[calc(50%+26rem)] top-[calc(20%+3rem)] w-[max(16rem,min(24rem,calc(50vw-26rem-2rem)))]"
  >
    <SectionComments
      sectionAddress={address}
      comments={sectionComments}
      visible={commentsVisible}
    />
  </div>
</div>

<style>
  .section-with-comment {
    position: relative;
  }

  .section-with-comment:hover :global(.single-line-button) {
    opacity: 1 !important;
  }
</style>
