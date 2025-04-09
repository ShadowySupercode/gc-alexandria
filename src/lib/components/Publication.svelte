<script lang="ts">
  import {
    Button,
    Sidebar,
    SidebarGroup,
    SidebarItem,
    SidebarWrapper,
    Skeleton,
    TextPlaceholder,
    Tooltip,
  } from "flowbite-svelte";
  import { onMount } from "svelte";
  import { BookOutline } from "flowbite-svelte-icons";
  import Preview from "./Preview.svelte";
  import { pharosInstance } from "$lib/parser";
  import { page } from "$app/state";

  let { rootId, publicationType } = $props<{ rootId: string, publicationType: string }>();

  if (rootId !== $pharosInstance.getRootIndexId()) {
    console.error("Root ID does not match parser root index ID");
  }

  const tocBreakpoint = 1140;

  let activeHash = $state(page.url.hash);
  let showToc: boolean = $state(true);
  let showTocButton: boolean = $state(false);

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

  /**
   * Hides the table of contents sidebar when the window shrinks below a certain size.  This
   * prevents the sidebar from occluding the article content.
   */
  function setTocVisibilityOnResize() {
    showToc = window.innerWidth >= tocBreakpoint;
    showTocButton = window.innerWidth < tocBreakpoint;
  }

  /**
   * Hides the table of contents sidebar when the user clicks outside of it.
   */
  function hideTocOnClick(ev: MouseEvent) {
    const target = ev.target as HTMLElement;

    if (target.closest(".sidebar-leather") || target.closest(".btn-leather")) {
      return;
    }

    if (showToc) {
      showToc = false;
    }
  }

  onMount(() => {
    // Always check whether the TOC sidebar should be visible.
    setTocVisibilityOnResize();

    window.addEventListener("hashchange", scrollToElementWithOffset);
    // Also handle the case where the user lands on the page with a hash in the URL
    scrollToElementWithOffset();

    window.addEventListener("resize", setTocVisibilityOnResize);
    window.addEventListener("click", hideTocOnClick);

    return () => {
      window.removeEventListener("hashchange", scrollToElementWithOffset);
      window.removeEventListener("resize", setTocVisibilityOnResize);
      window.removeEventListener("click", hideTocOnClick);
    };
  });
</script>

{#if showTocButton && !showToc}
  <Button
    class="btn-leather fixed top-20 left-4 h-6 w-6"
    outline={true}
    onclick={(ev: MouseEvent) => {
      showToc = true;
      ev.stopPropagation();
    }}
  >
    <BookOutline />
  </Button>
  <Tooltip>Show Table of Contents</Tooltip>
{/if}
<!-- TODO: Get TOC from parser. -->
<!-- {#if showToc}
  <Sidebar class='sidebar-leather fixed top-20 left-0 px-4 w-60' {activeHash}>
    <SidebarWrapper>
      <SidebarGroup class='sidebar-group-leather overflow-y-scroll'>
        {#each events as event}
          <SidebarItem
            class='sidebar-item-leather'
            label={event.getMatchingTags('title')[0][1]}
            href={`${$page.url.pathname}#${normalizeHashPath(event.getMatchingTags('title')[0][1])}`}
          />
        {/each}
      </SidebarGroup>
    </SidebarWrapper>
  </Sidebar>
{/if} -->
<div class="flex flex-col space-y-4 max-w-2xl">
  <Preview {rootId} {publicationType} />
</div>

<style>
  :global(.sidebar-group-leather) {
    max-height: calc(100vh - 8rem);
  }
</style>
