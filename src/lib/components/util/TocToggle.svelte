<script lang="ts">
  import {
    Button, Heading,
    Sidebar,
    SidebarGroup,
    SidebarItem,
    SidebarWrapper,
    Skeleton,
    TextPlaceholder,
    Tooltip
  } from "flowbite-svelte";
  import { onMount } from "svelte";
  import { pharosInstance } from "$lib/parser";
  import { publicationColumnVisibility } from "$lib/stores";
  import { page } from "$app/state";

  let { rootId } = $props<{ rootId: string }>();

  if (rootId !== $pharosInstance.getRootIndexId()) {
    console.error("Root ID does not match parser root index ID");
  }

  const tocBreakpoint = 1140;

  let activeHash = $state(page.url.hash);

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
    publicationColumnVisibility.update(v => ({ ...v, toc: window.innerWidth >= tocBreakpoint}));
  }

  /**
   * Hides the table of contents sidebar when the user clicks outside of it.
   */
  function hideTocOnClick(ev: MouseEvent) {
    const target = ev.target as HTMLElement;

    if (target.closest(".sidebar-leather") || target.closest(".btn-leather")) {
      return;
    }

    if ($publicationColumnVisibility.toc) {
      publicationColumnVisibility.update(v => ({ ...v, toc: false}));
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

<!-- TODO: Get TOC from parser. -->
{#if $publicationColumnVisibility.toc}
  <Sidebar  class='sidebar-leather left-0' {activeHash}>
    <SidebarWrapper>
      <SidebarGroup class='sidebar-group-leather'>
        <Heading tag="h1" class="h-leather !text-lg">Table of contents</Heading>
        <!--{#each events as event}-->
        <!--  <SidebarItem-->
        <!--    class='sidebar-item-leather'-->
        <!--    label={event.getMatchingTags('title')[0][1]}-->
        <!--    href={`${$page.url.pathname}#${normalizeHashPath(event.getMatchingTags('title')[0][1])}`}-->
        <!--  />-->
        <!--{/each}-->
      </SidebarGroup>
    </SidebarWrapper>
  </Sidebar>
{/if}