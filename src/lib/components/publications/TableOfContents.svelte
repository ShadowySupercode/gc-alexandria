<script lang="ts">
  import {
    TableOfContents,
    type TocEntry,
  } from "$lib/components/publications/table_of_contents.svelte";
  import { getContext } from "svelte";
  import {
    SidebarDropdownWrapper,
    SidebarGroup,
    SidebarItem,
  } from "flowbite-svelte";
  import Self from "./TableOfContents.svelte";

  let { depth, onSectionFocused } = $props<{
    rootAddress: string;
    depth: number;
    onSectionFocused?: (address: string) => void;
  }>();

  let toc = getContext("toc") as TableOfContents;

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
</script>

<!-- TODO: Figure out how to style indentations. -->
<!-- TODO: Make group title fonts the same as entry title fonts. -->
<SidebarGroup>
  {#each entries as entry}
    {@const address = entry.address}
    {@const expanded = toc.expandedMap.get(address) ?? false}
    {@const isLeaf = toc.leaves.has(address)}
    {#if isLeaf}
      <SidebarItem
        label={entry.title}
        href={`#${address}`}
        spanClass="px-2 text-ellipsis"
        onclick={() => onSectionFocused?.(address)}
      />
    {:else}
      {@const childDepth = depth + 1}
      <SidebarDropdownWrapper
        label={entry.title}
        btnClass="flex items-center p-2 w-full font-normal text-gray-900 rounded-lg transition duration-75 group hover:bg-primary-50 dark:text-white dark:hover:bg-primary-800"
        bind:isOpen={() => expanded, (open) => setEntryExpanded(address, open)}
      >
        <Self rootAddress={address} depth={childDepth} {onSectionFocused} />
      </SidebarDropdownWrapper>
    {/if}
  {/each}
</SidebarGroup>
