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
  import { getContext, onMount } from "svelte";
  import { BookOutline } from "flowbite-svelte-icons";
  import { page } from "$app/state";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";
  import PublicationSection from "./PublicationSection.svelte";
  import type { PublicationTree } from "$lib/data_structures/publication_tree";
  import Details from "$components/util/Details.svelte";
  import { publicationColumnVisibility } from "$lib/stores";

  let { rootAddress, publicationType, indexEvent } = $props<{
    rootAddress: string,
    publicationType: string,
    indexEvent: NDKEvent
  }>();

  const publicationTree = getContext('publicationTree') as PublicationTree;

  // #region Loading

  // TODO: Test load handling.

  let leaves = $state<NDKEvent[]>([]);
  let isLoading = $state<boolean>(false);
  let lastElementRef = $state<HTMLElement | null>(null);

  let observer: IntersectionObserver;

  async function loadMore(count: number) {
    isLoading = true;

    for (let i = 0; i < count; i++) {
      const nextItem = await publicationTree.next();
      if (leaves.includes(nextItem.value) || nextItem.done) {
        isLoading = false;
        return;
      }
      leaves.push(nextItem.value);
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

    observer.observe(lastElementRef!);
    return () => observer.unobserve(lastElementRef!);
  });

  // #endregion

  let currentBlog: null|string = $state(null);

  function isDefaultVisible() {
    if (publicationType !== 'blog') {
      return true;
    } else {
      return $publicationColumnVisibility.blog;
    }
  }

  function loadBlog(rootId: string) {
    // depending on the size of the screen, also toggle blog list visibility
    if (window.innerWidth < 1024) {
      $publicationColumnVisibility.blog = false;
    }
    $publicationColumnVisibility.inner = true;
    currentBlog = rootId;
  }

  // #region ToC


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
        if (entry.isIntersecting && !isLoading) {
          loadMore(4);
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

{#if $publicationColumnVisibility.details}
  <div class="flex flex-col space-y-4 max-w-xl min-w-24 sm:min-w-36 sm:flex-grow-1 p-2 overflow-auto">
    <div class="card-leather bg-highlight dark:bg-primary-800 p-4 mx-2 rounded-lg border">
      <Details event={indexEvent} />
    </div>
  </div>
{/if}


{#if showTocButton && !showToc}
  <!-- <Button
    class="btn-leather fixed top-20 left-4 h-6 w-6"
    outline={true}
    on:click={(ev) => {
      showToc = true;
      ev.stopPropagation();
    }}
  >
    <BookOutline />
  </Button>
  <Tooltip>Show Table of Contents</Tooltip> -->
{/if}
<!-- TODO: Use loader to build ToC. -->
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

{#if isDefaultVisible()}
  <div class="flex flex-col space-y-4 overflow-auto
          {publicationType === 'blog' ? 'max-w-xl flex-grow-1' : 'max-w-2xl flex-grow-2' }
          {currentBlog !== null ? 'discreet' : ''}
  ">
    <div class="card-leather bg-highlight dark:bg-primary-800 p-4 mx-2 mb-4 rounded-lg border">
      <Details event={indexEvent} />
    </div>
<div class="flex flex-col space-y-4 max-w-2xl">
  {#each leaves as leaf, i}
    <PublicationSection
      rootAddress={rootAddress}
      leaves={leaves}
      address={leaf.tagAddress()}
      ref={(el) => setLastElementRef(el, i)}
    />
  {/each}
</div>
  </div>
{/if}

{#if currentBlog !== null && $publicationColumnVisibility.inner }
  {#key currentBlog }
    <div class="flex flex-col space-y-4 max-w-3xl overflow-auto flex-grow-2">
      <span>Todo...</span>
    </div>
  {/key}
{/if}

{#if $publicationColumnVisibility.social }
  <div class="flex flex-col space-y-4 max-w-xl overflow-auto flex-grow-1">

  </div>
{/if}

<style>
  :global(.sidebar-group-leather) {
    max-height: calc(100vh - 8rem);
  }
</style>
