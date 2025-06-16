<script lang='ts'>
  import { TableOfContents, type TocEntry } from '$lib/components/publications/table_of_contents.svelte';
  import { getContext } from 'svelte';
  import { Accordion, AccordionItem, SidebarDropdownWrapper, SidebarGroup, SidebarItem } from 'flowbite-svelte';
  import Self from './TableOfContents.svelte';

  export type TocDisplayMode = 'accordion' | 'sidebar';

  let {
    displayMode = 'accordion',
    depth,
    onSectionFocused,
  } = $props<{ 
    displayMode?: TocDisplayMode;
    rootAddress: string;
    depth: number;
    onSectionFocused?: (address: string) => void;
  }>();

  let toc = getContext('toc') as TableOfContents;

  let entries = $derived.by<TocEntry[]>(() => {
    const newEntries = [];
    for (const [_, entry] of toc.addressMap) {
      if (entry.depth !== depth) {
        continue;
      }

      newEntries.push(entry);
    }

    return newEntries;
  });

  function setEntryExpanded(address: string, expanded: boolean = false) {
    const entry = toc.getEntry(address);
    if (!entry) {
      return;
    }

    toc.expandedMap.set(address, expanded);
    entry.resolveChildren();
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
      {@const expanded = toc.expandedMap.get(address) ?? false}
      <AccordionItem 
        bind:open={
          () => expanded,
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
      {@const expanded = toc.expandedMap.get(address) ?? false}
      {#if entry.children.length > 0}
        {@const childDepth = depth + 1}
        <SidebarDropdownWrapper
          label={entry.title}
          bind:isOpen={
            () => expanded,
            (open) => setEntryExpanded(address, open)
          }
        >
          <Self
            displayMode={displayMode}
            rootAddress={address}
            depth={childDepth}
            onSectionFocused={onSectionFocused}
          />
        </SidebarDropdownWrapper>
      {:else}
        <!-- TODO: Add href -->
        <SidebarItem
          label={entry.title}
          onclick={() => handleEntryClick(address, !expanded)}
        />
      {/if}
    {/each}
  </SidebarGroup>
{/if}