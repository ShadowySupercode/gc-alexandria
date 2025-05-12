<script lang="ts">
  import {
    Alert,
    Button,
    Sidebar,
    SidebarGroup,
    SidebarItem,
    SidebarWrapper,
    Skeleton,
    TextPlaceholder,
    Tooltip,
  } from "flowbite-svelte";
  import { getContext, onMount } from "svelte";
  import { BookOutline, ExclamationCircleOutline } from "flowbite-svelte-icons";
  import { page } from "$app/stores";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";
  import PublicationSection from "./PublicationSection.svelte";
  import type { PublicationTree } from "$lib/data_structures/publication_tree";

  let { rootAddress, publicationType, indexEvent } = $props<{ 
    rootAddress: string, 
    publicationType: string,
    indexEvent: NDKEvent
  }>();

  const publicationTree = getContext('publicationTree') as PublicationTree;

  // #region Loading

  // TODO: Test load handling.

  let leaves = $state<Array<NDKEvent | null>>([]);
  let isLoading = $state<boolean>(false);
  let isDone = $state<boolean>(false);
  let lastElementRef = $state<HTMLElement | null>(null);

  let observer: IntersectionObserver;

  async function loadMore(count: number) {
    isLoading = true;

    for (let i = 0; i < count; i++) {
      const iterResult = await publicationTree.next();
      const { done, value } = iterResult;

      if (done) {
        isDone = true;
        break;
      }

      leaves.push(value);
    }

    isLoading = false;
  }

  function setLastElementRef(el: HTMLElement, i: number) {
    if (i === leaves.length - 1) {
      lastElementRef = el;
    }
  }

  $effect(() => {
    if (!lastElementRef) {
      return;
    }

    if (isDone) {
      observer?.unobserve(lastElementRef!);
      return;
    }

    observer?.observe(lastElementRef!);
    return () => observer?.unobserve(lastElementRef!);
  });

  // #endregion

  // #region ToC

  const tocBreakpoint = 1140;

  let activeHash = $state($page.url.hash);
  let showToc: boolean = $state(true);
  let showTocButton: boolean = $state(false);

  let currentPath = $page.url.pathname;

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

  // #endregion

  onMount(() => {
    // Always check whether the TOC sidebar should be visible.
    setTocVisibilityOnResize();
    window.addEventListener("hashchange", scrollToElementWithOffset);
    // Also handle the case where the user lands on the page with a hash in the URL
    scrollToElementWithOffset();
    window.addEventListener("resize", setTocVisibilityOnResize);
    window.addEventListener("click", hideTocOnClick);

    // Set up the intersection observer.
    observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !isLoading && !isDone) {
          loadMore(1);
        }
      });
    }, { threshold: 0.5 });
    loadMore(8);

    return () => {
      window.removeEventListener("hashchange", scrollToElementWithOffset);
      window.removeEventListener("resize", setTocVisibilityOnResize);
      window.removeEventListener("click", hideTocOnClick);

      observer.disconnect();
    };
  });
</script>

<!-- TODO: Keep track of already-loaded leaves. -->
<!-- TODO: Handle entering mid-document and scrolling up. -->

<div class="publication-container">
  {#each leaves as leaf, i}
    {#if leaf == null}
      <Alert class="message-error">
        <ExclamationCircleOutline class="w-5 h-5" />
        Error loading content. One or more events could not be loaded.
      </Alert>
    {:else}
      <PublicationSection
        rootAddress={rootAddress}
        leaves={leaves}
        address={leaf.tagAddress()}
        ref={(el) => setLastElementRef(el, i)}
      />
    {/if}
  {/each}
  <div class="publication-footer">
    {#if isLoading}
      <Button disabled class="btn-base">
        Loading...
      </Button>
    {:else if !isDone}
      <Button class="btn-base" on:click={() => loadMore(1)}>
        Show More
      </Button>
    {/if}
  </div>
</div>

{#if showTocButton && !showToc}
  <Button
    class="btn-secondary toc-toggle-btn"
    outline={true}
    on:click={(ev) => {
      showToc = true;
      ev.stopPropagation();
    }}
  >
    <BookOutline />
  </Button>
  <Tooltip>Show Table of Contents</Tooltip>
{/if}

{#if showToc}
  <Sidebar class="toc-container">
    <SidebarWrapper>
      <SidebarGroup class="toc-list">
        {#each leaves as leaf}
          {#if leaf && leaf.getMatchingTags('title').length > 0}
            <SidebarItem
              class="toc-item"
              label={leaf.getMatchingTags('title')[0][1]}
              href={`${currentPath}#${normalizeHashPath(leaf.getMatchingTags('title')[0][1])}`}
            />
          {/if}
        {/each}
      </SidebarGroup>
    </SidebarWrapper>
  </Sidebar>
{/if}

<style>
  :global(.sidebar-group-leather) {
    max-height: calc(100vh - 8rem);
  }
</style>
