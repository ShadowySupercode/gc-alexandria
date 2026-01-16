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
    onCommentPosted,
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
    onCommentPosted?: () => void;
  } = $props();

  const asciidoctor: Asciidoctor = getContext("asciidoctor");
  const ndk: NDK = getContext("ndk");

  // Filter comments for this section
  // AI-NOTE: NIP-22: Uppercase tags (A, E, I, K, P) point to root scope (section/publication)
  // Lowercase tags (a, e, i, k, p) point to parent item (comment being replied to)
  // All comments scoped to this section will have uppercase A tag matching section address
  let sectionComments = $derived.by(() => {
    // Step 1: Find all comments scoped to this section (have uppercase A tag matching section address)
    const directComments = allComments.filter((comment) => {
      // NIP-22: Look for uppercase A tag (root scope)
      const rootATag = comment.tags.find((t) => t[0] === "A");
      const matches = rootATag && rootATag[1] === address;
      
      // AI-NOTE: Debug logging to help diagnose comment filtering issues
      if (rootATag) {
        console.debug("[PublicationSection] Comment filtering:", {
          sectionAddress: address,
          commentRootATag: rootATag[1],
          matches,
          commentId: comment.id?.substring(0, 8),
        });
      }
      
      return matches;
    });
    
    // Step 2: Build a set of comment IDs that match this section (for efficient lookup)
    const matchingCommentIds = new Set(
      directComments.map(c => c.id?.toLowerCase()).filter(Boolean)
    );
    
    // Step 3: Recursively find all replies to matching comments
    // NIP-22: Replies have lowercase e tag pointing to parent comment ID
    // They also have uppercase A tag matching section address (same root scope)
    const allMatchingComments = new Set<NDKEvent>(directComments);
    let foundNewReplies = true;
    
    // Keep iterating until we find no new replies (handles nested replies)
    while (foundNewReplies) {
      foundNewReplies = false;
      
      for (const comment of allComments) {
        // Skip if already included
        if (allMatchingComments.has(comment)) {
          continue;
        }
        
        // NIP-22: Check if this comment is scoped to this section (uppercase A tag)
        const rootATag = comment.tags.find((t) => t[0] === "A");
        if (!rootATag || rootATag[1] !== address) {
          // Not scoped to this section, skip
          continue;
        }
        
        // NIP-22: Check if this is a reply (has lowercase e tag pointing to a matching comment)
        const lowercaseETags = comment.tags.filter(t => t[0] === "e");
        for (const eTag of lowercaseETags) {
          const parentId = eTag[1]?.toLowerCase();
          if (parentId && matchingCommentIds.has(parentId)) {
            // This is a reply to a matching comment - include it
            allMatchingComments.add(comment);
            matchingCommentIds.add(comment.id?.toLowerCase() || "");
            foundNewReplies = true;
            console.debug(`[PublicationSection] Found reply ${comment.id?.substring(0, 8)} to matching comment ${parentId.substring(0, 8)} (NIP-22)`);
            break; // Found a match, no need to check other e tags
          }
        }
      }
    }
    
    const filtered = Array.from(allMatchingComments);
    console.debug(`[PublicationSection] Filtered ${filtered.length} comments (${directComments.length} direct, ${filtered.length - directComments.length} replies) for section ${address} from ${allComments.length} total comments`);
    
    // AI-NOTE: Debug logging to check for nested replies in filtered comments
    const filteredCommentIds = new Set(filtered.map(c => c.id?.toLowerCase()).filter(Boolean));
    for (const comment of filtered) {
      const lowercaseETags = comment.tags.filter(t => t[0] === "e");
      for (const eTag of lowercaseETags) {
        const parentId = eTag[1]?.toLowerCase();
        if (parentId && filteredCommentIds.has(parentId)) {
          console.debug(`[PublicationSection] Found nested reply ${comment.id?.substring(0, 8)} to filtered comment ${parentId.substring(0, 8)}`);
        }
      }
    }
    
    return filtered;
  });

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
<!-- AI-NOTE: Removed overflow-x-hidden to allow comments panel to be visible when positioned absolutely -->
<div class="relative w-full">
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
                    onCommentPosted={onCommentPosted}
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

      <!-- Comments - shown below content on all screens -->
      <div class="mt-8 w-full text-left">
        <SectionComments
          sectionAddress={address}
          comments={sectionComments}
          visible={commentsVisible}
        />
      </div>
    {/await}
  </section>
</div>

<style>
  .section-with-comment {
    position: relative;
  }

  .section-with-comment:hover :global(.single-line-button) {
    opacity: 1 !important;
  }
</style>
