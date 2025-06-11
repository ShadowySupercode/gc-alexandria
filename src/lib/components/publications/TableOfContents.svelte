<script lang='ts'>
  import { TableOfContents, type TocEntry } from '$lib/components/publications/table_of_contents.svelte';
  import { getContext } from 'svelte';
  import { Accordion, AccordionItem, Card, SidebarDropdownWrapper, SidebarGroup, SidebarItem } from 'flowbite-svelte';
  import Self from './TableOfContents.svelte';
  import type { SveltePublicationTree } from './svelte_publication_tree.svelte';
  import { page } from '$app/state';

  export type TocDisplayMode = 'accordion' | 'sidebar';

  let {
    displayMode = 'accordion',
    rootAddress,
    depth,
    onSectionFocused,
  } = $props<{ 
    displayMode?: TocDisplayMode;
    rootAddress: string;
    depth: number;
    onSectionFocused?: (address: string) => void;
  }>();

  let publicationTree = getContext('publicationTree') as SveltePublicationTree;
  let toc = new TableOfContents(rootAddress, publicationTree, page.url.pathname ?? "");

  let entries = $derived.by(() => {
    console.debug("[ToC] Filtering entries for depth", depth);
    const entries = Array
      .from(toc.addressMap.values())
      .filter((entry) => entry.depth === depth);
    console.debug("[ToC] Filtered entries", entries.map((e) => e.title));
    return entries;
  });

  // Track the currently visible section for highlighting
  let currentSection = $state<string | null>(null);

  // Handle section visibility changes from the IntersectionObserver
  function handleSectionVisibility(address: string, isVisible: boolean) {
    if (isVisible) {
      currentSection = address;
    }
  }

  // Toggle expansion of a ToC entry
  async function toggleExpansion(entry: TocEntry) {
    // Update the current section in the ToC
    const tocEntry = toc.getEntry(entry.address);
    if (tocEntry) {
      // Ensure the parent sections are expanded
      let parent = tocEntry.parent;
      while (parent) {
        parent.expanded = true;
        parent = parent.parent;
      }
    }

    entry.expanded = !entry.expanded;
    if (entry.expanded && !entry.childrenResolved) {
      onSectionFocused?.(entry.address);
      await entry.resolveChildren();
    }
  }
</script>

{#if displayMode === 'accordion'}
  <Accordion flush multiple>
    {#each entries as entry}
      <AccordionItem open={entry.expanded}>
        {#snippet header()}
          <span class="text-gray-800 dark:text-gray-300">{entry.title}</span>
        {/snippet}
        {#if entry.children.length > 0}
          <Self rootAddress={entry.address} depth={depth + 1} onSectionFocused={onSectionFocused} />
        {/if}
      </AccordionItem>
    {/each}
  </Accordion>
{:else}
  <SidebarGroup>
    {#each entries as entry}
      {#if entry.children.length > 0}
        <SidebarDropdownWrapper label={entry.title}>
          <Self
            displayMode={displayMode}
            rootAddress={entry.address}
            depth={depth + 1}
            onSectionFocused={onSectionFocused}
          />
        </SidebarDropdownWrapper>
      {:else}
        <SidebarItem label={entry.title} href={entry.href} />
      {/if}
    {/each}
  </SidebarGroup>
{/if}