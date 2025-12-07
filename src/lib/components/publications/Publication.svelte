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
  import type { TableOfContents as TocType } from "./table_of_contents.svelte";
  import ArticleNav from "$components/util/ArticleNav.svelte";
  import { deleteEvent } from "$lib/services/deletion";
  import { getNdkContext, activeOutboxRelays } from "$lib/ndk";
  import { goto } from "$app/navigation";
  import HighlightLayer from "./HighlightLayer.svelte";
  import { EyeOutline, EyeSlashOutline } from "flowbite-svelte-icons";
  import HighlightButton from "./HighlightButton.svelte";
  import HighlightSelectionHandler from "./HighlightSelectionHandler.svelte";
  import CommentLayer from "./CommentLayer.svelte";
  import CommentButton from "./CommentButton.svelte";
  import SectionComments from "./SectionComments.svelte";
  import { Textarea, P } from "flowbite-svelte";
  import { userStore } from "$lib/stores/userStore";

  let { rootAddress, publicationType, indexEvent, publicationTree, toc } =
    $props<{
      rootAddress: string;
      publicationType: string;
      indexEvent: NDKEvent;
      publicationTree: SveltePublicationTree;
      toc: TocType;
    }>();

  const ndk = getNdkContext();

  // Highlight layer state
  let highlightsVisible = $state(false);
  let highlightLayerRef: any = null;
  let publicationContentRef: HTMLElement | null = $state(null);

  // Comment layer state
  let commentsVisible = $state(true);
  let comments = $state<NDKEvent[]>([]);
  let commentLayerRef: any = null;
  let showArticleCommentUI = $state(false);
  let articleCommentContent = $state("");
  let isSubmittingArticleComment = $state(false);
  let articleCommentError = $state<string | null>(null);
  let articleCommentSuccess = $state(false);

  // Toggle between mock and real data for testing (DEBUG MODE)
  // Can be controlled via VITE_USE_MOCK_COMMENTS and VITE_USE_MOCK_HIGHLIGHTS environment variables
  let useMockComments = $state(
    import.meta.env.VITE_USE_MOCK_COMMENTS === "true",
  );
  let useMockHighlights = $state(
    import.meta.env.VITE_USE_MOCK_HIGHLIGHTS === "true",
  );

  // Log initial state for debugging
  console.log("[Publication] Mock data initialized:", {
    envVars: {
      VITE_USE_MOCK_COMMENTS: import.meta.env.VITE_USE_MOCK_COMMENTS,
      VITE_USE_MOCK_HIGHLIGHTS: import.meta.env.VITE_USE_MOCK_HIGHLIGHTS,
    },
  });

  // Derive all event IDs and addresses for highlight fetching
  let allEventIds = $derived.by(() => {
    const ids = [indexEvent.id];
    leaves.forEach((leaf) => {
      if (leaf?.id) ids.push(leaf.id);
    });
    return ids;
  });

  let allEventAddresses = $derived.by(() => {
    const addresses = [rootAddress];
    leaves.forEach((leaf) => {
      if (leaf) {
        const addr = leaf.tagAddress();
        if (addr) addresses.push(addr);
      }
    });
    return addresses;
  });

  // Filter comments for the root publication (kind 30040)
  let articleComments = $derived(
    comments.filter((comment) => {
      // Check if comment targets the root publication via #a tag
      const aTag = comment.tags.find((t) => t[0] === "a");
      return aTag && aTag[1] === rootAddress;
    }),
  );

  // #region Loading
  let leaves = $state<Array<NDKEvent | null>>([]);
  let isLoading = $state(false);
  let isDone = $state(false);
  let lastElementRef = $state<HTMLElement | null>(null);
  let activeAddress = $state<string | null>(null);
  let loadedAddresses = $state<Set<string>>(new Set());
  let hasInitialized = $state(false);
  let highlightModeActive = $state(false);
  let publicationDeleted = $state(false);

  let observer: IntersectionObserver;

  async function loadMore(count: number) {
    if (!publicationTree) {
      console.warn("[Publication] publicationTree is not available");
      return;
    }

    console.log(
      `[Publication] Loading ${count} more events. Current leaves: ${leaves.length}, loaded addresses: ${loadedAddresses.size}`,
    );

    isLoading = true;

    try {
      for (let i = 0; i < count; i++) {
        const iterResult = await publicationTree.next();
        const { done, value } = iterResult;

        if (done) {
          console.log("[Publication] Iterator done, no more events");
          isDone = true;
          break;
        }

        if (value) {
          const address = value.tagAddress();
          console.log(`[Publication] Got event: ${address} (${value.id})`);
          if (!loadedAddresses.has(address)) {
            loadedAddresses.add(address);
            leaves.push(value);
            console.log(`[Publication] Added event: ${address}`);
          } else {
            console.warn(`[Publication] Duplicate event detected: ${address}`);
          }
        } else {
          console.log("[Publication] Got null event");
          leaves.push(null);
        }
      }
    } catch (error) {
      console.error("[Publication] Error loading more content:", error);
    } finally {
      isLoading = false;
      console.log(
        `[Publication] Finished loading. Total leaves: ${leaves.length}, loaded addresses: ${loadedAddresses.size}`,
      );
    }
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

  // AI-NOTE:  Combined effect to handle publicationTree changes and initial loading
  // This prevents conflicts between separate effects that could cause duplicate loading
  $effect(() => {
    if (publicationTree) {
      // Reset state when publicationTree changes
      leaves = [];
      isLoading = false;
      isDone = false;
      lastElementRef = null;
      loadedAddresses = new Set();
      hasInitialized = false;

      // Reset the publication tree iterator to prevent duplicate events
      if (typeof publicationTree.resetIterator === "function") {
        publicationTree.resetIterator();
      }

      // AI-NOTE:  Use setTimeout to ensure iterator reset completes before loading
      // This prevents race conditions where loadMore is called before the iterator is fully reset
      setTimeout(() => {
        // Load initial content after reset
        console.log("[Publication] Loading initial content after reset");
        hasInitialized = true;
        loadMore(12);
      }, 0);
    }
  });

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
    // depending on the size of the screen, also toggle discussion visibility
    publicationColumnVisibility.update((current) => {
      const updated = current;
      if (window.innerWidth < 1024) {
        // Don't set blog = false on mobile - we need it to show the article
        // The blog list is already hidden via CSS (hidden md:flex)
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

  function toggleHighlights() {
    highlightsVisible = !highlightsVisible;
  }

  function toggleComments() {
    commentsVisible = !commentsVisible;
  }

  function handleCommentPosted() {
    console.log("[Publication] Comment posted, refreshing comment layer");
    // Refresh the comment layer after a short delay to allow relay indexing
    setTimeout(() => {
      if (commentLayerRef) {
        commentLayerRef.refresh();
      }
    }, 500);
  }

  async function submitArticleComment() {
    if (!articleCommentContent.trim()) {
      articleCommentError = "Comment cannot be empty";
      return;
    }

    isSubmittingArticleComment = true;
    articleCommentError = null;
    articleCommentSuccess = false;

    try {
      // Parse the root address to get event details
      const parts = rootAddress.split(":");
      if (parts.length !== 3) {
        throw new Error("Invalid address format");
      }

      const [kindStr, authorPubkey, dTag] = parts;
      const kind = parseInt(kindStr);

      // Create comment event (kind 1111)
      const commentEvent = new (await import("@nostr-dev-kit/ndk")).NDKEvent(
        ndk,
      );
      commentEvent.kind = 1111;
      commentEvent.content = articleCommentContent;

      // Get relay hint
      const relayHint = $activeOutboxRelays[0] || "";

      // Add tags following NIP-22
      commentEvent.tags = [
        ["A", rootAddress, relayHint, authorPubkey],
        ["K", kind.toString()],
        ["P", authorPubkey, relayHint],
        ["a", rootAddress, relayHint],
        ["k", kind.toString()],
        ["p", authorPubkey, relayHint],
      ];

      // Sign and publish
      await commentEvent.sign();
      await commentEvent.publish();

      console.log("[Publication] Article comment published:", commentEvent.id);

      articleCommentSuccess = true;
      articleCommentContent = "";

      // Close UI and refresh after delay
      setTimeout(() => {
        showArticleCommentUI = false;
        articleCommentSuccess = false;
        handleCommentPosted();
      }, 1500);
    } catch (err) {
      console.error("[Publication] Error posting article comment:", err);
      articleCommentError =
        err instanceof Error ? err.message : "Failed to post comment";
    } finally {
      isSubmittingArticleComment = false;
    }
  }

  /**
   * Handles deletion of the entire publication
   */
  async function handleDeletePublication() {
    const confirmed = confirm(
      "Are you sure you want to delete this entire publication? This action will publish a deletion request to all relays.",
    );

    if (!confirmed) return;

    try {
      await deleteEvent(
        {
          eventAddress: indexEvent.tagAddress(),
          eventKind: indexEvent.kind,
          reason: "User deleted publication",
          onSuccess: (deletionEventId) => {
            console.log(
              "[Publication] Deletion event published:",
              deletionEventId,
            );
            publicationDeleted = true;

            // Redirect after 2 seconds
            setTimeout(() => {
              goto("/publications");
            }, 2000);
          },
          onError: (error) => {
            console.error("[Publication] Failed to delete publication:", error);
            alert(`Failed to delete publication: ${error}`);
          },
        },
        ndk,
      );
    } catch (error) {
      console.error("[Publication] Error deleting publication:", error);
      alert(`Error: ${error}`);
    }
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
          if (
            entry.isIntersecting &&
            !isLoading &&
            !isDone &&
            publicationTree
          ) {
            loadMore(1);
          }
        });
      },
      { threshold: 0.5 },
    );

    // AI-NOTE:  Removed duplicate loadMore call
    // Initial content loading is handled by the $effect that watches publicationTree
    // This prevents duplicate loading when both onMount and $effect trigger

    return () => {
      observer.disconnect();
    };
  });

  // Setup highlight layer container reference
  $effect(() => {
    if (publicationContentRef && highlightLayerRef) {
      highlightLayerRef.setContainer(publicationContentRef);
    }
  });

  // #endregion
</script>

<!-- Add gap & items-start so sticky sidebars size correctly -->
<div
  class="relative grid gap-4 items-start grid-cols-1 grid-rows-[auto_1fr]"
>
  <!-- Full-width ArticleNav row -->
  <ArticleNav {publicationType} rootId={indexEvent.id} {indexEvent} />

  <!-- Highlight selection handler -->
  <HighlightSelectionHandler
    isActive={highlightModeActive}
    publicationEvent={indexEvent}
    onHighlightCreated={() => {
      highlightModeActive = false;
      // Refresh highlights after a short delay to allow relay indexing
      setTimeout(() => {
        if (highlightLayerRef) {
          console.log("[Publication] Refreshing highlights after creation");
          highlightLayerRef.refresh();
        }
      }, 500);
    }}
  />
  <!-- Content row -->
  <div class="contents flex justify-center">
    <!-- Table of contents column removed - using overlay drawer instead -->
    <div class="mt-[70px] w-full max-w-7xl">
      <!-- Default publications -->
      {#if $publicationColumnVisibility.main}
        <!-- Remove overflow-auto so page scroll drives it -->
        <div
          class="flex flex-col p-4 space-y-4 max-w-3xl flex-grow-2 mx-auto"
          bind:this={publicationContentRef}
        >
          <!-- Publication header with comments (similar to section layout) -->
          <div class="relative">
            <!-- Main header content - centered -->
            <div class="max-w-4xl mx-auto px-4">
              <div
                class="card-leather bg-highlight dark:bg-primary-900 p-4 mb-4 rounded-lg border"
              >
                <Details
                  event={indexEvent}
                  onDelete={handleDeletePublication}
                />
              </div>

              {#if publicationDeleted}
                <Alert color="yellow" class="mb-4">
                  <ExclamationCircleOutline class="w-5 h-5 inline mr-2" />
                  Publication deleted. Redirecting to publications page...
                </Alert>
              {/if}
            </div>

            <!-- Mobile article comments - shown below header on smaller screens -->
            <div class="xl:hidden mt-4 max-w-4xl mx-auto px-4">
              <SectionComments
                sectionAddress={rootAddress}
                comments={articleComments}
                visible={commentsVisible}
              />
            </div>

            <!-- Desktop article comments - positioned on right side on XL+ screens -->
            <div
              class="hidden xl:block absolute left-[calc(50%+26rem)] top-0 w-[max(16rem,min(24rem,calc(50vw-26rem-2rem)))]"
            >
              <SectionComments
                sectionAddress={rootAddress}
                comments={articleComments}
                visible={commentsVisible}
              />
            </div>
          </div>

          <!-- Action buttons row -->
          <div class="flex justify-between gap-2 mb-4 bg-transparent">
            <div class="flex gap-2 bg-transparent">
              <Button
                color="light"
                size="sm"
                onclick={() => (showArticleCommentUI = !showArticleCommentUI)}
              >
                {showArticleCommentUI ? "Close Comment" : "Comment On Article"}
              </Button>
              <HighlightButton bind:isActive={highlightModeActive} />
            </div>
            <div class="flex gap-2 bg-transparent">
              <Button color="light" size="sm" onclick={toggleComments}>
                {#if commentsVisible}
                  <EyeSlashOutline class="w-4 h-4 mr-2" />
                  Hide Comments
                {:else}
                  <EyeOutline class="w-4 h-4 mr-2" />
                  Show Comments
                {/if}
              </Button>
              <Button color="light" size="sm" onclick={toggleHighlights}>
                {#if highlightsVisible}
                  <EyeSlashOutline class="w-4 h-4 mr-2" />
                  Hide Highlights
                {:else}
                  <EyeOutline class="w-4 h-4 mr-2" />
                  Show Highlights
                {/if}
              </Button>
            </div>
          </div>

          <!-- Article Comment UI -->
          {#if showArticleCommentUI}
            <div
              class="mb-4 border border-gray-300 dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-gray-800"
            >
              <div class="space-y-3">
                <h4 class="font-semibold text-gray-900 dark:text-white">
                  Comment on Article
                </h4>

                <Textarea
                  bind:value={articleCommentContent}
                  placeholder="Write your comment on this article..."
                  rows={4}
                  disabled={isSubmittingArticleComment}
                />

                {#if articleCommentError}
                  <P class="text-red-600 dark:text-red-400 text-sm"
                    >{articleCommentError}</P
                  >
                {/if}

                {#if articleCommentSuccess}
                  <P class="text-green-600 dark:text-green-400 text-sm"
                    >Comment posted successfully!</P
                  >
                {/if}

                <div class="flex gap-2">
                  <Button
                    onclick={submitArticleComment}
                    disabled={isSubmittingArticleComment}
                  >
                    {isSubmittingArticleComment ? "Posting..." : "Post Comment"}
                  </Button>
                  <Button
                    color="light"
                    onclick={() => (showArticleCommentUI = false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          {/if}

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
                {publicationTree}
                {toc}
                allComments={comments}
                {commentsVisible}
                ref={(el) => onPublicationSectionMounted(el, address)}
              />
            {/if}
          {/each}
          <div class="flex justify-center my-4">
            {#if isLoading}
              <Button disabled color="primary">Loading...</Button>
            {:else if !isDone}
              <Button color="primary" onclick={() => loadMore(1)}
                >Show More</Button
              >
            {:else}
              <p class="text-gray-500 dark:text-gray-400">
                You've reached the end of the publication.
              </p>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Blog view: two-column layout on desktop, single column on mobile -->
      {#if $publicationColumnVisibility.blog}
        <div class="flex flex-col md:flex-row gap-4 w-full">
          <!-- Blog list: centered when no article, left when article is open -->
          <div
            class={`flex flex-col p-4 space-y-4 ${isInnerActive()
              ? 'md:flex-shrink-0 md:w-[500px]'
              : 'mx-auto md:mx-auto max-w-3xl'} ${isInnerActive() ? 'hidden md:flex' : ''}`}
          >
            <div
              class="card-leather bg-highlight dark:bg-primary-900 p-4 mb-4 rounded-lg border"
            >
              <Details event={indexEvent} onDelete={handleDeletePublication} />
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

          <!-- Selected article: right column on desktop, replaces TOC on mobile -->
          {#if isInnerActive()}
            {#key currentBlog}
              <div class="flex flex-col p-4 max-w-3xl md:flex-grow min-w-0 mx-auto md:mx-0">
                {#if currentBlogEvent && currentBlog}
                  {@const address = currentBlog}
                  <PublicationSection
                    {rootAddress}
                    {leaves}
                    {address}
                    {publicationTree}
                    {toc}
                    allComments={comments}
                    {commentsVisible}
                    ref={(el) => onPublicationSectionMounted(el, address)}
                  />
                {:else}
                  <div class="text-center py-8">
                    <p class="text-gray-500 dark:text-gray-400">Loading article...</p>
                  </div>
                {/if}
              </div>
            {/key}
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>

<!-- Discussion sidebar (overlay, outside layout) -->
<div
  class="mt-[70px] relative {$publicationColumnVisibility.discussion
    ? 'w-64'
    : 'w-auto'}"
>
  {#if $publicationColumnVisibility.discussion}
    <Sidebar
      class="z-10 ml-4 fixed top-[162px] h-[calc(100vh-165px)] overflow-y-auto"
      classes={{
        div: "bg-transparent",
      }}
    >
          <SidebarWrapper>
            <SidebarGroup>
              <div class="flex justify-between items-baseline">
                <Heading tag="h1" class="h-leather !text-lg">Discussion</Heading
                >
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
                  <SectionComments
                    sectionAddress={rootAddress}
                    comments={articleComments}
                    visible={commentsVisible}
                  />
                  {#if articleComments.length === 0}
                    <p
                      class="text-sm text-gray-500 dark:text-gray-400 text-center py-4"
                    >
                      No comments yet. Be the first to comment!
                    </p>
                  {/if}
                </div>
              </div>
            </SidebarGroup>
          </SidebarWrapper>
        </Sidebar>
      {/if}
</div>

<!-- Table of Contents Drawer (overlay, works on mobile and desktop) -->
{#if publicationType !== "blog" && !isLeaf}
  <!-- Backdrop overlay -->
  <div
    class="fixed inset-0 bg-black/50 z-[100] transition-opacity duration-300 {$publicationColumnVisibility.toc
      ? 'opacity-100 pointer-events-auto'
      : 'opacity-0 pointer-events-none'}"
    onclick={closeToc}
    role="button"
    tabindex="0"
    onkeydown={(e) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        closeToc();
      }
    }}
  ></div>
  
  <!-- Drawer -->
  <div
    class="fixed top-[162px] left-0 h-[calc(100vh-162px)] w-fit min-w-[280px] max-w-[min(98vw,500px)] z-[110] dark:bg-primary-900 bg-primary-50 rounded-r-lg shadow-xl transition-transform duration-300 ease-in-out {$publicationColumnVisibility.toc
      ? 'translate-x-0'
      : '-translate-x-full'}"
  >
    <div class="h-full flex flex-col overflow-hidden">
      <div class="flex-shrink-0 p-2 border-b border-gray-200 dark:border-gray-700">
        <CloseButton
          color="secondary"
          class="dark:text-primary-100"
          onclick={closeToc}
        ></CloseButton>
      </div>
      <div class="flex-1 overflow-y-auto overflow-x-visible px-2 w-full">
        <TableOfContents
          {rootAddress}
          {toc}
          depth={2}
          onSectionFocused={(address: string) =>
            publicationTree.setBookmark(address)}
          onLoadMore={() => {
            if (!isLoading && !isDone && publicationTree) {
              loadMore(4);
            }
          }}
          onClose={closeToc}
        />
      </div>
    </div>
  </div>
{/if}

<!-- Highlight Layer Component -->
<HighlightLayer
  bind:this={highlightLayerRef}
  eventIds={allEventIds}
  eventAddresses={allEventAddresses}
  bind:visible={highlightsVisible}
  {useMockHighlights}
/>

<!-- Comment Layer Component -->
<CommentLayer
  bind:this={commentLayerRef}
  eventIds={allEventIds}
  eventAddresses={allEventAddresses}
  bind:comments
  {useMockComments}
/>
