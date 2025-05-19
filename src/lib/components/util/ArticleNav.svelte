<script lang="ts">
  import { BookOutline, CaretLeftOutline, CloseOutline, GlobeOutline } from "flowbite-svelte-icons";
  import { Button } from "flowbite-svelte";
  import { publicationColumnVisibility } from "$lib/stores";
  import InlineProfile from "$components/util/InlineProfile.svelte";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";
  import { onDestroy, onMount } from "svelte";

  let {
    rootId,
    publicationType,
    indexEvent
  } = $props<{
    rootId: any,
    publicationType: string,
    indexEvent: NDKEvent
  }>();

  let title: string = $derived(indexEvent.getMatchingTags('title')[0]?.[1]);
  let author: string = $derived(indexEvent.getMatchingTags('author')[0]?.[1] ?? 'unknown');
  let pubkey: string = $derived(indexEvent.getMatchingTags('p')[0]?.[1] ?? null);
  let isLeaf: boolean = $derived(indexEvent.kind === 30041);

  let lastScrollY = $state(0);
  let isVisible = $state(true);

  // Function to toggle column visibility
  function toggleColumn(column: 'toc' | 'blog' | 'inner' | 'discussion') {
    publicationColumnVisibility.update(current => {
      const newValue = !current[column];
      const updated = { ...current, [column]: newValue };

      if (window.innerWidth < 1400 && column === 'blog' && newValue) {
        updated.discussion = false;
      }

      return updated;
    });
  }

  function shouldShowBack() {
    const vis = $publicationColumnVisibility;
    return ['discussion', 'toc', 'inner'].some(key => vis[key as keyof typeof vis]);
  }

  function backToMain() {
    publicationColumnVisibility.update(current => {
      const updated = { ...current };

      // if current is 'inner', just go back to blog
      if (current.inner && !(current.discussion || current.toc)) {
        updated.inner = false;
        updated.blog = true;
        return updated;
      }

      updated.discussion = false;
      updated.toc = false;

      if (publicationType === 'blog') {
        updated.inner = true;
        updated.blog = false;
      } else {
        updated.main = true;
      }

      return updated;
    });
  }

  function backToBlog() {
    publicationColumnVisibility.update(current => {
      const updated = { ...current };
      updated.inner = false;
      updated.discussion = false;
      updated.blog = true;
      return updated;
    })
  }

  function handleScroll() {
    if (window.innerWidth < 768) {
      const currentScrollY = window.scrollY;

      // Hide on scroll down
      if (currentScrollY > lastScrollY && currentScrollY > 50) {
        isVisible = false;
      }
      // Show on scroll up
      else if (currentScrollY < lastScrollY) {
        isVisible = true;
      }

      lastScrollY = currentScrollY;
    }
  }

  let unsubscribe: () => void;
  onMount(() => {
    window.addEventListener('scroll', handleScroll);
    unsubscribe = publicationColumnVisibility.subscribe(() => {
      isVisible = true; // show navbar when store changes
    });
  });

  onDestroy(() => {
    window.removeEventListener('scroll', handleScroll);
    unsubscribe();
  });
</script>

<nav class="Navbar navbar-leather flex fixed top-[60px] sm:top-[76px] w-full min-h-[70px] px-2 sm:px-4 py-2.5 z-10 transition-transform duration-300 {isVisible ? 'translate-y-0' : '-translate-y-full'}">
  <div class="mx-auto flex space-x-2 container">
    <div class="flex items-center space-x-2 md:min-w-52 min-w-8">
      {#if shouldShowBack()}
        <Button class='btn-leather !w-auto sm:hidden' outline={true} onclick={backToMain}>
          <CaretLeftOutline class="!fill-none inline mr-1" /><span class="hidden sm:inline">Back</span>
        </Button>
      {/if}
      {#if !isLeaf}
        {#if publicationType === 'blog'}
          <Button class="btn-leather hidden sm:flex !w-auto {$publicationColumnVisibility.blog ? 'active' : ''}"
                  outline={true} onclick={() => toggleColumn('blog')} >
            <BookOutline class="!fill-none inline mr-1"  /><span class="hidden sm:inline">Table of Contents</span>
          </Button>
        {:else if !$publicationColumnVisibility.discussion && !$publicationColumnVisibility.toc}
          <Button class='btn-leather !w-auto' outline={true} onclick={() => toggleColumn('toc')}>
            <BookOutline class="!fill-none inline mr-1"  /><span class="hidden sm:inline">Table of Contents</span>
          </Button>
        {/if}
      {/if}
    </div>
    <div class="flex flex-grow text justify-center items-center">
        <p class="max-w-[60vw] line-ellipsis"><b class="text-nowrap">{title}</b> <span class="whitespace-nowrap">by <InlineProfile pubkey={pubkey} title={author} /></span></p>
    </div>
    <div class="flex justify-end items-center space-x-2 md:min-w-52 min-w-8">
      {#if $publicationColumnVisibility.inner}
        <Button class='btn-leather !w-auto hidden sm:flex' outline={true} onclick={backToBlog}>
          <CloseOutline class="!fill-none inline mr-1" /><span class="hidden sm:inline">Close</span>
        </Button>
      {/if}
      {#if publicationType !== 'blog' && !$publicationColumnVisibility.discussion}
        <Button class="btn-leather !hidden sm:flex !w-auto" outline={true} onclick={() => toggleColumn('discussion')} >
          <GlobeOutline class="!fill-none inline mr-1"  /><span class="hidden sm:inline">Discussion</span>
        </Button>
      {/if}
    </div>
  </div>
</nav>