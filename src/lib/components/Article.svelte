<script lang="ts">
  import { ndk } from '$lib/ndk';
  import type { NDKEvent } from '@nostr-dev-kit/ndk';
  import { page } from '$app/stores';
  import { Alert, Button, Heading, P, Sidebar, SidebarGroup, SidebarItem, SidebarWrapper, Skeleton, TextPlaceholder, Tooltip, xs } from 'flowbite-svelte';
  import { onMount } from 'svelte';
  import { BookOutline, ExclamationCircleOutline } from 'flowbite-svelte-icons';
  import Pharos, { parser } from '$lib/parser';
  import Preview from './Preview.svelte';
    import { goto, invalidateAll } from '$app/navigation';

  export let index: NDKEvent | null | undefined;

  $parser ??= new Pharos($ndk);

  $: activeHash = $page.url.hash;

  const getContentRoot = async (index?: NDKEvent | null | undefined): Promise<string | null> => {
    if (!index) {
      return null;
    }

    await $parser.fetch(index);
    return $parser.getRootIndexId();
  };

  function normalizeHashPath(str: string): string {
    return str
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w-]/g, '');
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
          behavior: 'auto',
        });
      }
    }
  }

  let showToc: boolean = true;
  let showTocButton: boolean = false;
  const tocBreakpoint = 1140;

  /**
   * Hides the table of contents sidebar when the window shrinks below a certain size.  This
   * prevents the sidebar from occluding the article content.
   */
  const setTocVisibilityOnResize = () => {
    showToc = window.innerWidth >= tocBreakpoint;
    showTocButton = window.innerWidth < tocBreakpoint;
  };

  /**
   * Hides the table of contents sidebar when the user clicks outside of it.
   */
  const hideTocOnClick = (ev: MouseEvent) => {
    const target = ev.target as HTMLElement;

    if (target.closest('.sidebar-leather') || target.closest('.btn-leather')) {
      return;
    }

    if (showToc) {
      showToc = false;
    }
  };

  onMount(() => {
    // Always check whether the TOC sidebar should be visible.
    setTocVisibilityOnResize();

    window.addEventListener('hashchange', scrollToElementWithOffset);
    // Also handle the case where the user lands on the page with a hash in the URL
    scrollToElementWithOffset();

    window.addEventListener('resize', setTocVisibilityOnResize);
    window.addEventListener('click', hideTocOnClick);

    return () => {
      window.removeEventListener('hashchange', scrollToElementWithOffset);
      window.removeEventListener('resize', setTocVisibilityOnResize);
      window.removeEventListener('click', hideTocOnClick);
    };
  });
</script>

{#await getContentRoot(index)}
  <Sidebar class='sidebar-leather fixed top-20 left-0 px-4 w-60'>
    <SidebarWrapper>
      <Skeleton/>
    </SidebarWrapper>
  </Sidebar>
  <TextPlaceholder class='max-w-2xl'/>
{:then rootId}
  {#if rootId}
    {#if showTocButton && !showToc}
      <Button
        class='btn-leather fixed top-20 left-4 h-6 w-6'
        outline={true}
        on:click={ev => {
          showToc = true;
          ev.stopPropagation();
        }}
      >
        <BookOutline />
      </Button>
      <Tooltip>
        Show Table of Contents
      </Tooltip>
    {/if}
    <!-- TODO: Get TOC from parser. -->
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
    <div class='flex flex-col space-y-4 max-w-2xl'>
      <Preview rootId={rootId} />
    </div>
  {/if}
{:catch err}
  <Alert>
    <div class='flex items-center space-x-2'>
      <ExclamationCircleOutline class='w-6 h-6' />
      <span class='text-lg font-medium'>
        Failed to load publication.
      </span>
    </div>
    <P size='sm'>
      Alexandria failed to find one or more of the events comprising this publication.
    </P>
    <P size='xs'>
      {err.message}
    </P>
    <div class='flex space-x-2'>
      <Button class='btn-leather' size='sm' on:click={() => invalidateAll()}>
        Try Again
      </Button>
      <Button class='btn-leather' size='sm' outline on:click={() => goto('/')}>
        Return to Home
      </Button>
    </div>
  </Alert>
{/await}

<style>
  :global(.sidebar-group-leather) {
    max-height: calc(100vh - 8rem);
  }
</style>
