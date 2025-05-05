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
  import type { NDKEvent } from "@nostr-dev-kit/ndk";
  import PublicationSection from "./PublicationSection.svelte";
  import type { PublicationTree } from "$lib/data_structures/publication_tree";
  import Details from "$components/util/Details.svelte";
  import { publicationColumnVisibility } from "$lib/stores";
  import BlogHeader from "$components/blog/BlogHeader.svelte";

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

  function isInnerActive() {
    return currentBlog !== null && $publicationColumnVisibility.inner;
  }

  function loadBlog(rootId: string) {
    // depending on the size of the screen, also toggle blog list visibility
    if (window.innerWidth < 1024) {
      $publicationColumnVisibility.blog = false;
    }
    $publicationColumnVisibility.inner = true;
    currentBlog = rootId;
    // set current blog values for publication render
    console.log(currentBlog);
  }



  onMount(() => {
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
      observer.disconnect();
    };
  });

</script>

{#if isDefaultVisible()}
  <div class="flex flex-col p-4 space-y-4 overflow-auto
        {publicationType === 'blog' ? 'max-w-xl flex-grow-1' : 'max-w-2xl flex-grow-2' }
        {isInnerActive() ? 'discreet' : ''}
">
    <div class="card-leather bg-highlight dark:bg-primary-800 p-4 mb-4 rounded-lg border">
      <Details event={indexEvent} />
    </div>

    {#if publicationType === 'blog'}
      <!-- List blog excerpts -->
      {#each leaves as leaf, i}
        <BlogHeader
          rootId={leaf.tagAddress()}
          event={leaf}
          onBlogUpdate={loadBlog}
          active={!(isInnerActive())}
        />
      {/each}
    {:else}
      {#each leaves as leaf, i}
        <PublicationSection
          rootAddress={rootAddress}
          leaves={leaves}
          address={leaf.tagAddress()}
          ref={(el) => setLastElementRef(el, i)}
        />
      {/each}
    {/if}

  </div>
{/if}

{#if isInnerActive() }
  {#key currentBlog }
    <div class="flex flex-col p-4 max-w-3xl overflow-auto flex-grow-2">
      {#each leaves as leaf, i}
        {#if leaf.tagAddress() === currentBlog}
          <PublicationSection
            rootAddress={rootAddress}
            leaves={leaves}
            address={leaf.tagAddress()}
            ref={(el) => setLastElementRef(el, i)}
          />
        {/if}
      {/each}
    </div>
  {/key}
{/if}

{#if $publicationColumnVisibility.social }
  <div class="flex flex-col p-4 space-y-4 max-w-xl overflow-auto flex-grow-1">

  </div>
{/if}
