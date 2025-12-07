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

  let { rootAddress, depth, onSectionFocused, onLoadMore, onClose, toc } = $props<{
    rootAddress: string;
    depth: number;
    toc: TableOfContents;
    onSectionFocused?: (address: string) => void;
    onLoadMore?: () => void;
    onClose?: () => void;
  }>();

  let entries = $derived.by<TocEntry[]>(() => {
    const newEntries = [];
    const rootEntry = rootAddress === toc.getRootEntry()?.address 
      ? toc.getRootEntry() 
      : toc.getEntry(rootAddress);
    
    if (!rootEntry) {
      return [];
    }
    
    // Filter entries that are direct children of rootAddress at the correct depth
    for (const [_, entry] of toc.addressMap) {
      // Must match the depth
      if (entry.depth !== depth) {
        continue;
      }
      
      // Check if entry is a direct child of rootAddress
      // Primary check: parent relationship (set when resolveChildren is called)
      // Fallback: entry is in rootEntry's children array
      // Final fallback: depth-based check for root's direct children only
      const isDirectChild = 
        entry.parent?.address === rootAddress ||
        rootEntry.children.some((child: TocEntry) => child.address === entry.address) ||
        (entry.depth === rootEntry.depth + 1 && 
         rootAddress === toc.getRootEntry()?.address &&
         !entry.parent); // Only use depth check if parent not set (temporary state)
      
      if (!isDirectChild) {
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
    
    // Close the drawer after navigation
    onClose?.();
    
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

  // Calculate indentation based on depth
  // Depth 2 = no indent (Beginning, root entry)
  // Depth 3 = indent level 1 (30041 sections under 30040)
  // Depth 4+ = more indentation
  function getIndentClass(depth: number): string {
    if (depth <= 2) {
      return "";
    }
    // Each level beyond 2 adds 1rem (16px) of padding
    const indentLevel = depth - 2;
    // Use standard Tailwind classes: pl-4 (1rem), pl-8 (2rem), pl-12 (3rem), etc.
    const paddingMap: Record<number, string> = {
      1: "pl-4",   // 1rem
      2: "pl-8",   // 2rem
      3: "pl-12",  // 3rem
      4: "pl-16",  // 4rem
      5: "pl-20",  // 5rem
    };
    return paddingMap[indentLevel] || `pl-[${indentLevel}rem]`;
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
  <!-- Beginning entry - scrolls to top of page -->
  {#if depth === 2}
    <SidebarItem
      label="Beginning"
      href="#"
      spanClass="px-2 text-ellipsis"
      class={getIndentClass(2)}
      onclick={(e) => {
        e.preventDefault();
        window.scrollTo({
          top: 0,
          behavior: 'smooth',
        });
        onClose?.();
      }}
    >
      <!-- Beginning entry -->
    </SidebarItem>
  {/if}
  <!-- Root entry (publication header) -->
  {#if depth === 2}
    {@const rootEntry = toc.getRootEntry()}
    {#if rootEntry}
      {@const isVisible = isEntryVisible(rootEntry.address)}
      <SidebarItem
        label={rootEntry.title}
        href={`#${rootEntry.address}`}
        spanClass="px-2 text-ellipsis"
        class={`${getIndentClass(rootEntry.depth)} ${isVisible ? "toc-highlight" : ""} `}
        onclick={() => {
          const element = document.getElementById(rootEntry.address);
          if (element) {
            element.scrollIntoView({
              behavior: 'smooth',
              block: 'start',
            });
          }
          onClose?.();
        }}
      >
        <!-- Publication header entry -->
      </SidebarItem>
    {/if}
  {/if}
  {#each entries as entry, index}
    {@const address = entry.address}
    {@const expanded = toc.expandedMap.get(address) ?? false}
    {@const isLeaf = toc.leaves.has(address)}
    {@const isVisible = isEntryVisible(address)}
    {@const indentClass = getIndentClass(entry.depth)}
    {#if isLeaf}
      <SidebarItem
        label={entry.title}
        href={`#${address}`}
        spanClass="px-2 text-ellipsis"
        class={`${indentClass} ${isVisible ? "toc-highlight" : ""} `}
        onclick={() => handleSectionClick(address)}
      >
        <!-- Empty for now - could add icons or labels here in the future -->
      </SidebarItem>
    {:else}
      {@const childDepth = depth + 1}
      <SidebarDropdownWrapper
        label={entry.title}
        btnClass="flex items-center p-2 w-full font-normal text-gray-900 rounded-lg transition duration-75 group hover:bg-primary-50 dark:text-white dark:hover:bg-primary-800 {isVisible ? 'toc-highlight' : ''} whitespace-nowrap min-w-fit {indentClass}"
        class="w-full"
        bind:isOpen={() => expanded, (open) => setEntryExpanded(address, open)}
      >
        <Self rootAddress={address} depth={childDepth} {toc} {onSectionFocused} {onLoadMore} {onClose} />
      </SidebarDropdownWrapper>
    {/if}
  {/each}
</SidebarGroup>
