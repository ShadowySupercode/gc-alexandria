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
  import { onMount, onDestroy } from "svelte";

  let { depth, onSectionFocused, onLoadMore } = $props<{
    rootAddress: string;
    depth: number;
    onSectionFocused?: (address: string) => void;
    onLoadMore?: () => void;
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

  // Track the currently visible section
  let currentVisibleSection = $state<string | null>(null);
  let observer: IntersectionObserver;

  function setEntryExpanded(address: string, expanded: boolean = false) {
    const entry = toc.getEntry(address);
    if (!entry) {
      return;
    }

    toc.expandedMap.set(address, expanded);
    entry.resolveChildren();
  }

  function handleSectionClick(address: string) {
    // Smooth scroll to the section
    const element = document.getElementById(address);
    if (element) {
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }
    
    onSectionFocused?.(address);
    
    // Check if this is the last entry and trigger loading more events
    const currentEntries = entries;
    const lastEntry = currentEntries[currentEntries.length - 1];
    if (lastEntry && lastEntry.address === address) {
      console.debug('[TableOfContents] Last entry clicked, triggering load more');
      onLoadMore?.();
    }
  }

  // Check if an entry is currently visible
  function isEntryVisible(address: string): boolean {
    return currentVisibleSection === address;
  }

  // Set up intersection observer to track visible sections
  onMount(() => {
    observer = new IntersectionObserver(
      (entries) => {
        // Find the section that is most visible in the viewport
        let maxIntersectionRatio = 0;
        let mostVisibleSection: string | null = null;

        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > maxIntersectionRatio) {
            maxIntersectionRatio = entry.intersectionRatio;
            mostVisibleSection = entry.target.id;
          }
        });

        if (mostVisibleSection && mostVisibleSection !== currentVisibleSection) {
          currentVisibleSection = mostVisibleSection;
        }
      },
      {
        threshold: [0, 0.25, 0.5, 0.75, 1],
        rootMargin: "-20% 0px -20% 0px", // Consider section visible when it's in the middle 60% of the viewport
      }
    );

    // Function to observe all section elements
    function observeSections() {
      const sections = document.querySelectorAll('section[id]');
      sections.forEach((section) => {
        observer.observe(section);
      });
    }

    // Initial observation
    observeSections();

    // Set up a mutation observer to watch for new sections being added
    const mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            // Check if the added node is a section with an id
            if (element.tagName === 'SECTION' && element.id) {
              observer.observe(element);
            }
            // Check if the added node contains sections
            const sections = element.querySelectorAll?.('section[id]');
            if (sections) {
              sections.forEach((section) => {
                observer.observe(section);
              });
            }
          }
        });
      });
    });

    // Start observing the document body for changes
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      mutationObserver.disconnect();
    };
  });

  onDestroy(() => {
    if (observer) {
      observer.disconnect();
    }
  });
</script>

<!-- TODO: Figure out how to style indentations. -->
<!-- TODO: Make group title fonts the same as entry title fonts. -->
<SidebarGroup>
  {#each entries as entry, index}
    {@const address = entry.address}
    {@const expanded = toc.expandedMap.get(address) ?? false}
    {@const isLeaf = toc.leaves.has(address)}
    {@const isVisible = isEntryVisible(address)}
    {@const isLastEntry = index === entries.length - 1}
    {#if isLeaf}
      <SidebarItem
        label={entry.title}
        href={`#${address}`}
        spanClass="px-2 text-ellipsis"
        class={`${isVisible ? "toc-highlight" : ""} ${isLastEntry ? "pb-4" : ""}`}
        onclick={() => handleSectionClick(address)}
      />
    {:else}
      {@const childDepth = depth + 1}
      <SidebarDropdownWrapper
        label={entry.title}
        btnClass="flex items-center p-2 w-full font-normal text-gray-900 rounded-lg transition duration-75 group hover:bg-primary-50 dark:text-white dark:hover:bg-primary-800 {isVisible ? 'toc-highlight' : ''} {isLastEntry ? 'pb-4' : ''}"
        bind:isOpen={() => expanded, (open) => setEntryExpanded(address, open)}
      >
        <Self rootAddress={address} depth={childDepth} {onSectionFocused} {onLoadMore} />
      </SidebarDropdownWrapper>
    {/if}
  {/each}
</SidebarGroup>
