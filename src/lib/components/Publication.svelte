<script lang="ts">
  import {
    Button, Card,
    Sidebar,
    SidebarGroup,
    SidebarItem,
    SidebarWrapper,
    Skeleton,
    TextPlaceholder,
    Tooltip
  } from "flowbite-svelte";
  import { HeartOutline } from 'flowbite-svelte-icons';
  import { getContext, onDestroy, onMount } from "svelte";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";
  import PublicationSection from "./PublicationSection.svelte";
  import type { PublicationTree } from "$lib/data_structures/publication_tree";
  import Details from "$components/util/Details.svelte";
  import { publicationColumnVisibility } from "$lib/stores";
  import BlogHeader from "$components/blog/BlogHeader.svelte";
  import Interactions from "$components/util/Interactions.svelte";
  import ZapOutline from "$components/util/ZapOutline.svelte";

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
  let currentBlogEvent: null|NDKEvent = $state(null);

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

  function isSocialActive() {
    return $publicationColumnVisibility.discussion;
  }

  function loadBlog(rootId: string) {
    // depending on the size of the screen, also toggle blog list & social visibility
    if (window.innerWidth < 1024) {
      $publicationColumnVisibility.blog = false;
      $publicationColumnVisibility.discussion = false;
    }
    $publicationColumnVisibility.inner = true;
    currentBlog = rootId;
    // set current blog values for publication render
    currentBlogEvent = leaves.find(i => i.tagAddress() === currentBlog) ?? null;
  }

  function showBlogHeaderOnMobile() {
    return (currentBlog && currentBlogEvent && window.innerWidth < 1140);
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

  onDestroy(() => {
    // reset visibility
    $publicationColumnVisibility = {
      toc: false,
      blog: true,
      main: true,
      inner: true,
      discussion: false,
      editing: false
    };
  })

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
    <div class="flex flex-col p-4 max-w-3xl overflow-auto flex-grow-2 max-h-[calc(100vh-146px)] sticky top-[146px]">
      {#each leaves as leaf, i}
        {#if leaf.tagAddress() === currentBlog}
          <div class="card-leather bg-highlight dark:bg-primary-800 p-4 mb-4 rounded-lg border">
            <Details event={leaf} />
          </div>

          <PublicationSection
            rootAddress={rootAddress}
            leaves={leaves}
            address={leaf.tagAddress()}
            ref={(el) => setLastElementRef(el, i)}
          />

          <Card class="ArticleBox card-leather min-w-full grid mt-4">
            <Interactions rootId={currentBlog} />
          </Card>
        {/if}
      {/each}
    </div>
  {/key}
{/if}

{#if isSocialActive() }
  <div class="flex flex-col p-4 max-w-3xl overflow-auto flex-grow-2 h-[calc(100vh-146px)] sticky top-[146px] space-y-4">
      {#if showBlogHeaderOnMobile()}
        <BlogHeader
          rootId={currentBlog}
          event={currentBlogEvent}
          onBlogUpdate={loadBlog}
          active={true}
        />

      {/if}
    <div class="flex flex-col w-full space-y-4">
      <Card class="ArticleBox card-leather w-full grid max-w-xl">
          <div class="flex flex-col my-2">
            <span>Unknown</span>
            <span class='text-gray-500'>1.1.1970</span>
          </div>
          <div class='flex flex-col flex-grow space-y-4'>
            This is a very intelligent comment placeholder that applies to all the content equally well.
          </div>
      </Card>

      <Card class="ArticleBox card-leather w-full grid grid-cols-2  max-w-xl">
          <div class="flex flex-col my-2">
            <span>Unknown</span>
            <span class='text-gray-500'>1.1.1970</span>
          </div>
          <div class='flex flex-col flex-grow  items-end justify-center'>
            <ZapOutline ></ZapOutline>
          </div>
      </Card>

      <Card class="ArticleBox card-leather w-full grid grid-cols-2 max-w-xl">
          <div class="flex flex-col my-2">
            <span>Unknown</span>
            <span class='text-gray-500'>1.1.1970</span>
          </div>
          <div class='flex flex-col flex-grow items-end justify-center'>
            <HeartOutline />
          </div>
      </Card>
    </div>
  </div>
{/if}
