<script lang="ts">
  import {
    Heading,
    Sidebar,
    SidebarGroup,
    SidebarItem,
    SidebarWrapper,
  } from "flowbite-svelte";
  import { onMount } from "svelte";
  import { pharosInstance, tocUpdate } from "$lib/parser";
  import { publicationColumnVisibility } from "$lib/stores";
  
  let { rootId } = $props<{ rootId: string }>();

  if (rootId !== $pharosInstance.getRootIndexId()) {
    console.error("Root ID does not match parser root index ID");
  }

  const tocBreakpoint = 1140;

  let activeHash = $state(window.location.hash);

  interface TocItem {
    label: string;
    hash: string;
  }

  // Get TOC items from parser
  let tocItems = $state<TocItem[]>([]);

  $effect(() => {
    // This will re-run whenever tocUpdate changes
    tocUpdate;
    const items: TocItem[] = [];
    const childIds = $pharosInstance.getChildIndexIds(rootId);
    console.log('TOC rootId:', rootId, 'childIds:', childIds);
    const processNode = (nodeId: string) => {
      const title = $pharosInstance.getIndexTitle(nodeId);
      if (title) {
        items.push({
          label: title,
          hash: `#${nodeId}`
        });
      }
      const children = $pharosInstance.getChildIndexIds(nodeId);
      children.forEach(processNode);
    };
    childIds.forEach(processNode);
    tocItems = items;
  });

  function normalizeHashPath(str: string): string {
    return str
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\w-]/g, "");
  }

  function scrollToElementWithOffset() {
    const hash = window.location.hash;
    if (hash) {
      const targetElement = document.querySelector(hash);
      if (targetElement) {
        const headerOffset = 80;
        const elementPosition = targetElement.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.scrollY - headerOffset;

        window.scrollTo({
          top: offsetPosition,
          behavior: "auto",
        });
      }
    }
  }

  function updateActiveHash() {
    activeHash = window.location.hash;
  }

  /**
   * Hides the table of contents sidebar when the window shrinks below a certain size.  This
   * prevents the sidebar from occluding the article content.
   */
  function setTocVisibilityOnResize() {
    // Always show TOC on laptop and larger screens, collapsible only on small/medium
    publicationColumnVisibility.update(v => ({ ...v, toc: window.innerWidth >= tocBreakpoint }));
  }

  /**
   * Hides the table of contents sidebar when the user clicks outside of it.
   */
  function hideTocOnClick(ev: MouseEvent) {
    const target = ev.target as HTMLElement;

    if (target.closest(".sidebar-leather") || target.closest(".btn-leather")) {
      return;
    }

    // Only allow hiding TOC on screens smaller than tocBreakpoint
    if (window.innerWidth < tocBreakpoint && $publicationColumnVisibility.toc) {
      publicationColumnVisibility.update(v => ({ ...v, toc: false}));
    }
  }

  onMount(() => {
    // Always check whether the TOC sidebar should be visible.
    setTocVisibilityOnResize();

    window.addEventListener("hashchange", updateActiveHash);
    window.addEventListener("hashchange", scrollToElementWithOffset);
    // Also handle the case where the user lands on the page with a hash in the URL
    scrollToElementWithOffset();

    window.addEventListener("resize", setTocVisibilityOnResize);
    window.addEventListener("click", hideTocOnClick);

    return () => {
      window.removeEventListener("hashchange", updateActiveHash);
      window.removeEventListener("hashchange", scrollToElementWithOffset);
      window.removeEventListener("resize", setTocVisibilityOnResize);
      window.removeEventListener("click", hideTocOnClick);
    };
  });
</script>

<!-- TODO: Get TOC from parser. -->
{#if $publicationColumnVisibility.toc}
  <Sidebar class='sidebar-leather left-0'>
    <SidebarWrapper>
      <SidebarGroup class='sidebar-group-leather'>
        <Heading tag="h1" class="h-leather !text-lg">Table of contents</Heading>
        <p>(This ToC is only for demo purposes, and is not fully-functional.)</p>
        {#each tocItems as item}
          <SidebarItem
            class="sidebar-item-leather {activeHash === item.hash ? 'bg-primary-200 font-bold' : ''}"
            label={item.label}
            href={item.hash}
          />
        {/each}
      </SidebarGroup>
    </SidebarWrapper>
  </Sidebar>
{/if}