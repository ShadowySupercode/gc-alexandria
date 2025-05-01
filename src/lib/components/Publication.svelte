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

  // #endregion

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

{#if $publicationColumnVisibility.details}
  <div class="flex flex-col space-y-4 max-w-xl min-w-24 sm:min-w-36 sm:flex-grow-1 p-2 overflow-auto">
    <div class="card-leather bg-highlight dark:bg-primary-800 p-4 mx-2 rounded-lg border">
      <Details event={indexEvent} />
    </div>
  </div>
{/if}

{#if isDefaultVisible()}
  <div class="flex flex-col space-y-4 overflow-auto
          {publicationType === 'blog' ? 'max-w-xl flex-grow-1' : 'max-w-2xl flex-grow-2' }
          {currentBlog !== null ? 'discreet' : ''}
  ">
    <div class="card-leather bg-highlight dark:bg-primary-800 p-4 mx-2 mb-4 rounded-lg border">
      <Details event={indexEvent} />
    </div>
  {#each leaves as leaf, i}
    <PublicationSection
      rootAddress={rootAddress}
      leaves={leaves}
      address={leaf.tagAddress()}
      ref={(el) => setLastElementRef(el, i)}
    />
  {/each}
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
