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

  let entries = $derived(
    Array
      .from(toc.addressMap.values())
      .filter((entry) => entry.depth === depth)
  );

  function getEntryExpanded(address: string) {
    return toc.getEntry(address)?.expanded;
  }

  function setEntryExpanded(address: string, expanded: boolean = false) {
    const entry = toc.getEntry(address);
    if (!entry) {
      return;
    }

    entry.expanded = expanded;
    if (entry.childrenResolved) {
      return;
    }

    if (expanded) {
      entry.resolveChildren();
    }
  }

  function handleEntryClick(address: string, expanded: boolean = false) {
    setEntryExpanded(address, expanded);
    onSectionFocused?.(address);
  }
</script>

<!-- TODO: Href doesn't work with query params. -->
{#if displayMode === 'accordion'}
  <Accordion multiple>
    {#each entries as entry}
      {@const address = entry.address}
      <AccordionItem 
        bind:open={
          () => getEntryExpanded(address),
          (open) => setEntryExpanded(address, open)
        }
      >
        {#snippet header()}
          <span class="text-gray-800 dark:text-gray-300">{entry.title}</span>
        {/snippet}
        {#if entry.children.length > 0}
          <Self
            displayMode={displayMode}
            rootAddress={entry.address}
            depth={depth + 1}
            onSectionFocused={onSectionFocused}
          />
        {/if}
      </AccordionItem>
    {/each}
  </Accordion>
{:else}
  <SidebarGroup>
    {#each entries as entry}
      {@const address = entry.address}
      {#if entry.children.length > 0}
        <SidebarDropdownWrapper
          label={entry.title}
          bind:isOpen={
            () => getEntryExpanded(address),
            (open) => setEntryExpanded(address, open)
          }
        >
          <Self
            displayMode={displayMode}
            rootAddress={entry.address}
            depth={depth + 1}
            onSectionFocused={onSectionFocused}
          />
        </SidebarDropdownWrapper>
      {:else}
        <!-- TODO: Add href -->
        <SidebarItem
          label={entry.title}
          onclick={() => handleEntryClick(address, !getEntryExpanded(address))}
        />
      {/if}
    {/each}
  </SidebarGroup>
{/if}