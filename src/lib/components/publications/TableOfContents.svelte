<script lang='ts'>
  import type { TableOfContents, TocEntry } from '$lib/components/publications/table_of_contents.svelte';
  import { getContext } from 'svelte';
  import { Accordion, AccordionItem, Card } from 'flowbite-svelte';
  import Self from './TableOfContents.svelte';

  let { 
    depth,
    onSectionFocused,
  } = $props<{ 
    depth: number;
    onSectionFocused?: (address: string) => void;
  }>();

  let toc = getContext('toc') as TableOfContents;

  let entries = $derived(
    Array
      .from(toc.addressMap.values())
      .filter((entry) => entry.depth === depth)
  );

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

<Accordion flush class='overflow-y-auto w-64 p-4'>
  {#each entries as entry}
    <AccordionItem open={entry.expanded}>
      <h3 class='text-lg font-bold'>{entry.title}</h3>
      {#if entry.children.length > 0}
        <Self depth={depth + 1} onSectionFocused={onSectionFocused} />
      {/if}
    </AccordionItem>
  {/each}
</Accordion>
