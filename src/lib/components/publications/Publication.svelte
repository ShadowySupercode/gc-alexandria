<script lang="ts">
  import {
    Alert,
    Button,
    Card,
    Sidebar,
    SidebarGroup,
    SidebarWrapper,
    Heading,
    CloseButton,
  } from "flowbite-svelte";
  import { getContext, onDestroy, onMount } from "svelte";
  import {
    CloseOutline,
    ExclamationCircleOutline,
  } from "flowbite-svelte-icons";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";
  import PublicationSection from "./PublicationSection.svelte";
  import Details from "$components/util/Details.svelte";
  import { publicationColumnVisibility } from "$lib/stores";
  import BlogHeader from "$components/cards/BlogHeader.svelte";
  import Interactions from "$components/util/Interactions.svelte";
  import type { SveltePublicationTree } from "./svelte_publication_tree.svelte";
  import TableOfContents from "./TableOfContents.svelte";
  import TimelineTableOfContents from "./TimelineTableOfContents.svelte";
  import type { TableOfContents as TocType } from "./table_of_contents.svelte";

  let { rootAddress, publicationType, indexEvent } = $props<{
    rootAddress: string;
    publicationType: string;
    indexEvent: NDKEvent;
  }>();

  const publicationTree = getContext(
    "publicationTree",
  ) as SveltePublicationTree;
  const toc = getContext("toc") as TocType;

  // #region Loading

  let leaves = $state<Array<NDKEvent | null>>([]);
  let isLoading = $state<boolean>(false);
  let isDone = $state<boolean>(false);
  let lastElementRef = $state<HTMLElement | null>(null);
  let activeAddress = $state<string | null>(null);

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

  // #region Columns visibility

  let currentBlog: null | string = $state(null);
  let currentBlogEvent: null | NDKEvent = $state(null);
  const isLeaf = $derived(indexEvent.kind === 30041);

  function isInnerActive() {
    return currentBlog !== null && $publicationColumnVisibility.inner;
  }

  function closeToc() {
    publicationColumnVisibility.update((v) => ({ ...v, toc: false }));
  }

  function closeDiscussion() {
    publicationColumnVisibility.update((v) => ({ ...v, discussion: false }));
  }

  function loadBlog(rootId: string) {
    // depending on the size of the screen, also toggle blog list & discussion visibility
    publicationColumnVisibility.update((current) => {
      const updated = current;
      if (window.innerWidth < 1024) {
        updated.blog = false;
        updated.discussion = false;
      }
      updated.inner = true;
      return updated;
    });

    currentBlog = rootId;
    // set current blog values for publication render
    if (leaves.length > 0) {
      currentBlogEvent =
        leaves.find((i) => i && i.tagAddress() === currentBlog) ?? null;
    }
  }

  function showBlogHeader() {
    return currentBlog && currentBlogEvent && window.innerWidth < 1140;
  }

  // #endregion

  /**
   * Performs actions on the DOM element for a publication tree leaf when it is mounted.
   *
   * @param el The DOM element that was mounted.
   * @param address The address of the event that was mounted.
   */
  function onPublicationSectionMounted(el: HTMLElement, address: string) {
    // Update last element ref for the intersection observer.
    setLastElementRef(el, leaves.length);

    // Michael J - 08 July 2025 - NOTE: Updating the ToC from here somewhat breaks separation of
    // concerns, since the TableOfContents component is primarily responsible for working with the
    // ToC data structure. However, the Publication component has direct access to the needed DOM
    // element already, and I want to avoid complicated callbacks between the two components.
    // Update the ToC from the contents of the leaf section.
    const entry = toc.getEntry(address);
    if (!entry) {
      console.warn(`[Publication] No parent found for ${address}`);
      return;
    }
    toc.buildTocFromDocument(el, entry);
  }

  // #region Lifecycle hooks

  onDestroy(() => {
    // reset visibility
    publicationColumnVisibility.reset();
  });

  onMount(() => {
    // Set current columns depending on the publication type
    const isBlog = publicationType === "blog";
    publicationColumnVisibility.update((v) => ({
      ...v,
      main: !isBlog,
      blog: isBlog,
    }));
    if (isLeaf || isBlog) {
      publicationColumnVisibility.update((v) => ({ ...v, toc: false }));
    }

    // Set up the intersection observer.
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !isLoading && !isDone) {
            loadMore(1);
          }
        });
      },
      { threshold: 0.5 },
    );
    loadMore(12);

    return () => {
      observer.disconnect();
    };
  });

  // #endregion
</script>

<!-- Timeline Table of Contents (new LessWrong-style) -->
{#if publicationType !== "blog" || !isLeaf}
  <TimelineTableOfContents
    onSectionFocused={(address: string) =>
      publicationTree.setBookmark(address)}
    onLoadMore={() => {
      if (!isLoading && !isDone) {
        loadMore(4);
      }
    }}
  />
{/if}

<!-- Traditional Table of Contents (fallback/alternative) - Only show when explicitly toggled -->
{#if publicationType !== "blog" || !isLeaf}
  {#if $publicationColumnVisibility.toc}
    <Sidebar
      activeUrl={`#${activeAddress ?? ""}`}
      asideClass="fixed md:sticky top-[130px] sm:top-[146px] h-[calc(100vh-130px)] sm:h-[calc(100vh-146px)] z-10 bg-primary-0 dark:bg-primary-1000 px-5 w-80 left-0 pt-4 md:!pr-16 overflow-y-auto border border-l-4 rounded-lg border-primary-200 dark:border-primary-800 my-4"
      activeClass="flex items-center p-2 bg-primary-50 dark:bg-primary-800 p-2 rounded-lg"
      nonActiveClass="flex items-center p-2 hover:bg-primary-50 dark:hover:bg-primary-800 p-2 rounded-lg"
    >
      <CloseButton
        onclick={closeToc}
        class="btn-leather absolute top-4 right-4 hover:bg-primary-50 dark:hover:bg-primary-800"
      />
      <TableOfContents
        {rootAddress}
        depth={2}
        onSectionFocused={(address: string) =>
          publicationTree.setBookmark(address)}
        onLoadMore={() => {
          if (!isLoading && !isDone) {
            loadMore(4);
          }
        }}
      />
    </Sidebar>
  {/if}
{/if}

<!-- Default publications -->
{#if $publicationColumnVisibility.main}
  <div class="flex flex-col p-4 space-y-4 overflow-auto max-w-2xl flex-grow-2">
    <div
      class="card-leather bg-highlight dark:bg-primary-800 p-4 mb-4 rounded-lg border"
    >
      <Details event={indexEvent} />
    </div>
    <!-- Publication sections/cards -->
    {#each leaves as leaf, i}
      {#if leaf == null}
        <Alert class="flex space-x-2">
          <ExclamationCircleOutline class="w-5 h-5" />
          Error loading content. One or more events could not be loaded.
        </Alert>
      {:else}
        {@const address = leaf.tagAddress()}
        <PublicationSection
          {rootAddress}
          {leaves}
          {address}
          ref={(el) => onPublicationSectionMounted(el, address)}
        />
      {/if}
    {/each}
    <div class="flex justify-center my-4">
      {#if isLoading}
        <Button disabled color="primary">Loading...</Button>
      {:else if !isDone}
        <Button color="primary" on:click={() => loadMore(1)}>Show More</Button>
      {:else}
        <p class="text-gray-500 dark:text-gray-400">
          You've reached the end of the publication.
        </p>
      {/if}
    </div>
  </div>
{/if}

<!-- Blog list -->
{#if $publicationColumnVisibility.blog}
  <div
    class={`flex flex-col p-4 space-y-4 overflow-auto max-w-xl flex-grow-1 ${isInnerActive() ? "discreet" : ""}`}
  >
    <div
      class="card-leather bg-highlight dark:bg-primary-800 p-4 mb-4 rounded-lg border"
    >
      <Details event={indexEvent} />
    </div>
    <!-- List blog excerpts -->
    {#each leaves as leaf, i}
      {#if leaf}
        <BlogHeader
          rootId={leaf.tagAddress()}
          event={leaf}
          onBlogUpdate={loadBlog}
          active={!isInnerActive()}
        />
      {/if}
    {/each}
  </div>
{/if}

{#if isInnerActive()}
  {#key currentBlog}
    <div
      class="flex flex-col p-4 max-w-3xl overflow-auto flex-grow-2 max-h-[calc(100vh-146px)] sticky top-[146px]"
    >
      {#each leaves as leaf, i}
        {#if leaf && leaf.tagAddress() === currentBlog}
          <div
            class="card-leather bg-highlight dark:bg-primary-800 p-4 mb-4 rounded-lg border"
          >
            <Details event={leaf} />
          </div>

          <PublicationSection
            {rootAddress}
            {leaves}
            address={leaf.tagAddress()}
            ref={(el) => setLastElementRef(el, i)}
          />

          <Card class="ArticleBox !hidden card-leather min-w-full mt-4">
            <Interactions rootId={currentBlog} />
          </Card>
        {/if}
      {/each}
    </div>
  {/key}
{/if}

{#if $publicationColumnVisibility.discussion}
  <Sidebar class="sidebar-leather right-0 md:!pl-8">
    <SidebarWrapper>
      <SidebarGroup class="sidebar-group-leather">
        <div class="flex justify-between items-baseline">
          <Heading tag="h1" class="h-leather !text-lg">Discussion</Heading>
          <Button
            class="btn-leather hidden sm:flex z-30 !p-1 bg-primary-50 dark:bg-gray-800"
            outline
            onclick={closeDiscussion}
          >
            <CloseOutline />
          </Button>
        </div>
        <div class="flex flex-col space-y-4">
          <!-- TODO
                alternative for other publications and
                when blog is not opened, but discussion is opened from the list
          -->
          {#if showBlogHeader() && currentBlog && currentBlogEvent}
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
                <span class="text-gray-500">1.1.1970</span>
              </div>
              <div class="flex flex-col flex-grow space-y-4">
                This is a very intelligent comment placeholder that applies to
                all the content equally well.
              </div>
            </Card>
          </div>
        </div>
      </SidebarGroup>
    </SidebarWrapper>
  </Sidebar>
{/if}
