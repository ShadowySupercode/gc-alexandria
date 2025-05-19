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
  import { page } from "$app/state";
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

  let activeHash = $state(page.url.hash);

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
</script>

{#if $publicationColumnVisibility.details}
  <div class="flex flex-col space-y-4 max-w-xl flex-grow-1 p-2 bg-highlight">
    <Details event={indexEvent} />
  </div>
{/if}

{#if isDefaultVisible()}
  <div class="flex flex-col space-y-4 overflow-auto 
          {publicationType === 'blog' ? 'max-w-xl flex-grow-1' : 'max-w-2xl flex-grow-2' }
          {currentBlog !== null ? 'discreet' : ''}
  ">
    <Preview {rootId} {publicationType} index={0} onBlogUpdate={loadBlog} />
  </div>
{/if}

{#if currentBlog !== null && $publicationColumnVisibility.inner }
  {#key currentBlog }
  <div class="flex flex-col space-y-4 max-w-3xl overflow-auto flex-grow-2">
    <Preview rootId={currentBlog} {publicationType} index={0} />
  </div>
  {/key}
{/if}

{#if $publicationColumnVisibility.social }
  <div class="flex flex-col space-y-4 max-w-xl overflow-auto flex-grow-1 bg-highlight">
      <p>Social column</p>
  </div>
{/if}

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
<div class="flex flex-col space-y-4 max-w-2xl pb-10 px-4 sm:px-6 md:px-8">
  {#each leaves as leaf, i}
    {#if leaf == null}
      <Alert class='flex space-x-2'>
        <ExclamationCircleOutline class='w-5 h-5' />
        Error loading content.  One or more events could not be loaded.
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
  <div class="flex justify-center my-4">
    {#if isLoading}
      <Button disabled color="primary">
        Loading...
      </Button>
    {:else if !isDone}
      <Button color="primary" on:click={() => loadMore(1)}>
        Show More
      </Button>
    {:else}
      <p class="text-gray-500 dark:text-gray-400">You've reached the end of the publication.</p>
    {/if}
  </div>
</div>

<style>
  :global(.sidebar-group-leather) {
    max-height: calc(100vh - 8rem);
  }
</style>
