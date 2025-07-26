<script lang="ts">
  import { onMount } from 'svelte';
  import { Button, Input } from 'flowbite-svelte';
  import { page } from '$app/stores';
  import type { NDKEvent } from '$lib/utils/nostrUtils';
  import { getMatchingTags, toNpub } from '$lib/utils/nostrUtils';
  import { userBadge } from '$lib/snippets/UserSnippets.svelte';
  import ViewPublicationLink from '$lib/components/util/ViewPublicationLink.svelte';
  import { SEARCH_LIMITS } from '$lib/utils/search_constants';
  import { updatePageURL } from '$lib/utils/url_service';

  let {
    events,
    searchType,
    searchTerm,
    onEventClick,
    communityStatus = {},
    showPagination = true,
    onPageChange,
  }: {
    events: NDKEvent[];
    searchType: string | null;
    searchTerm: string | null;
    onEventClick: (event: NDKEvent) => void;
    communityStatus?: Record<string, boolean>;
    showPagination?: boolean;
    onPageChange?: (page: number) => void;
  } = $props();

  // Pagination state
  let itemsPerPage = $state(SEARCH_LIMITS.RESULTS_PER_PAGE);
  let showAllResults = $state(false);
  let pageInputValue = $state("");

  // Derived values - get current page from URL directly
  let currentPage = $derived(parseInt($page.url.searchParams.get('p') || '1', 10));
  let totalPages = $derived(Math.ceil(events.length / itemsPerPage));
  let startIndex = $derived((currentPage - 1) * itemsPerPage);
  let endIndex = $derived(Math.min(startIndex + itemsPerPage, events.length));
  let displayedEvents = $derived(events.slice(startIndex, endIndex));
  let shouldShowPagination = $derived(
    showPagination && events.length > itemsPerPage && !showAllResults
  );

  // Reset showAllResults when events change, but don't reset pagination
  $effect(() => {
    if (events.length > 0) {
      showAllResults = false;
    }
  });

  function nextPage() {
    if (currentPage < totalPages) {
      const newPage = currentPage + 1;
      updatePageURL(newPage);
      onPageChange?.(newPage);
    }
  }

  function prevPage() {
    if (currentPage > 1) {
      const newPage = currentPage - 1;
      updatePageURL(newPage);
      onPageChange?.(newPage);
    }
  }

  function goToPage(page: number) {
    if (page >= 1 && page <= totalPages) {
      updatePageURL(page);
      onPageChange?.(page);
    }
  }

  function handlePageInput() {
    const pageNum = parseInt(pageInputValue, 10);
    if (pageNum >= 1 && pageNum <= totalPages) {
      goToPage(pageNum);
      pageInputValue = ""; // Clear input after successful navigation
    }
  }

  function handlePageInputKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      handlePageInput();
    }
  }

  function showAll() {
    showAllResults = true;
  }

  function getSummary(event: NDKEvent): string | undefined {
    return getMatchingTags(event, 'summary')[0]?.[1];
  }

  function getDeferralNaddr(event: NDKEvent): string | undefined {
    return getMatchingTags(event, 'deferral')[0]?.[1];
  }

  function navigateToPublication(dTag: string) {
    // This would need to be passed as a prop or handled differently
    console.log('Navigate to publication:', dTag);
  }

  function isAddressableEvent(event: NDKEvent): boolean {
    // This would need to be imported or passed as a prop
    return (event.kind || 0) >= 30000 && (event.kind || 0) < 40000;
  }

  function getPageWindow(current: number, total: number): number[] {
    if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
    if (current <= 3) return [1, 2, 3, 4, 5];
    if (current >= total - 2) return [total - 4, total - 3, total - 2, total - 1, total];
    return [current - 2, current - 1, current, current + 1, current + 2];
  }
</script>

<div class="space-y-4">
  <!-- Results Header -->
  <div class="flex justify-between items-center">
    <div>
      <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-2">
        {#if searchType === 'n'}
          Search Results for name: "{searchTerm}" ({events.length} profiles)
        {:else if searchType === 't'}
          Search Results for t-tag: "{searchTerm}" ({events.length} events)
        {:else}
          Search Results for d-tag: "{searchTerm}" ({events.length} events)
        {/if}
      </h2>
      
      {#if events.length > itemsPerPage && !showAllResults}
        <p class="text-sm text-gray-600 dark:text-gray-400">
          Showing {displayedEvents.length} of {events.length} results. 
          <button 
            class="text-primary-600 dark:text-primary-400 hover:underline"
            onclick={showAll}
          >
            Show all results
          </button>
        </p>
      {/if}
    </div>
  </div>

  <!-- Results List -->
  <div class="space-y-4">
    {#each (showAllResults ? events : displayedEvents) as result, index}
      <button
        class="w-full text-left border border-gray-300 dark:border-gray-600 rounded-lg p-4 bg-white dark:bg-primary-900/70 hover:bg-gray-100 dark:hover:bg-primary-800 focus:bg-gray-100 dark:focus:bg-primary-800 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors overflow-hidden"
        onclick={() => onEventClick(result)}
      >
        <div class="flex flex-col gap-1">
          <div class="flex items-center gap-2 mb-1">
            <span class="font-medium text-gray-800 dark:text-gray-100">
              {searchType === 'n' ? 'Profile' : 'Event'} {showAllResults ? index + 1 : startIndex + index + 1}
            </span>
            <span class="text-xs text-gray-600 dark:text-gray-400">
              Kind: {result.kind}
            </span>
            {#if result.pubkey && communityStatus[result.pubkey]}
              <div
                class="flex-shrink-0 w-4 h-4 bg-yellow-100 dark:bg-yellow-900 rounded-full flex items-center justify-center"
                title="Has posted to the community"
              >
                <svg
                  class="w-3 h-3 text-yellow-600 dark:text-yellow-400"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              </div>
            {:else}
              <div class="flex-shrink-0 w-4 h-4"></div>
            {/if}
            <span class="text-xs text-gray-600 dark:text-gray-400">
              {@render userBadge(toNpub(result.pubkey) as string, undefined)}
            </span>
            <span class="text-xs text-gray-500 dark:text-gray-400 ml-auto">
              {result.created_at
                ? new Date(result.created_at * 1000).toLocaleDateString()
                : 'Unknown date'}
            </span>
          </div>
          
          {#if getSummary(result)}
            <div class="text-sm text-primary-900 dark:text-primary-200 mb-1 line-clamp-2">
              {getSummary(result)}
            </div>
          {/if}
          
          {#if getDeferralNaddr(result)}
            <div class="text-xs text-primary-800 dark:text-primary-300 mb-1">
              Read
              <span
                class="underline text-primary-700 dark:text-primary-400 hover:text-primary-900 dark:hover:text-primary-200 break-all cursor-pointer"
                onclick={(e) => {
                  e.stopPropagation();
                  navigateToPublication(getDeferralNaddr(result) || '');
                }}
                onkeydown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    navigateToPublication(getDeferralNaddr(result) || '');
                  }
                }}
                tabindex="0"
                role="button"
              >
                {getDeferralNaddr(result)}
              </span>
            </div>
          {/if}
          
          {#if isAddressableEvent(result)}
            <div class="text-xs text-blue-600 dark:text-blue-400 mb-1">
              <ViewPublicationLink event={result} />
            </div>
          {/if}
          
          {#if result.content}
            <div class="text-sm text-gray-800 dark:text-gray-200 mt-1 line-clamp-2 break-words">
              {result.content.slice(0, 200)}{result.content.length > 200 ? '...' : ''}
            </div>
          {/if}
        </div>
      </button>
    {/each}
  </div>

  <!-- Pagination Controls -->
  {#if shouldShowPagination}
    <div class="flex justify-center items-center gap-2 mt-6">
      <Button
        size="sm"
        color="light"
        disabled={currentPage === 1}
        onclick={prevPage}
      >
        Previous
      </Button>
      {#if totalPages <= 5}
        {#each Array.from({ length: totalPages }, (_, i) => i + 1) as pageNum}
          <Button
            size="sm"
            color={pageNum === currentPage ? 'primary' : 'light'}
            onclick={() => goToPage(pageNum)}
          >
            {pageNum}
          </Button>
        {/each}
      {:else}
        {#each getPageWindow(currentPage, totalPages) as pageNum}
          <Button
            size="sm"
            color={pageNum === currentPage ? 'primary' : 'light'}
            onclick={() => goToPage(pageNum)}
          >
            {pageNum}
          </Button>
        {/each}
        <span class="text-gray-500 dark:text-gray-400">...</span>
        <Button
          size="sm"
          color={totalPages === currentPage ? 'primary' : 'light'}
          onclick={() => goToPage(totalPages)}
        >
          {totalPages}
        </Button>
      {/if}
      <Button
        size="sm"
        color="light"
        disabled={currentPage === totalPages}
        onclick={nextPage}
      >
        Next
      </Button>
    </div>
    
    <div class="flex justify-center items-center gap-2 mt-2">
      <span class="text-sm text-gray-600 dark:text-gray-400">Go to page:</span>
      <Input
        type="number"
        size="sm"
        class="w-20 text-center"
        placeholder="Page"
        min="1"
        max={totalPages}
        bind:value={pageInputValue}
        onkeydown={handlePageInputKeydown}
      />
      <Button
        size="sm"
        color="light"
        onclick={handlePageInput}
        disabled={!pageInputValue || parseInt(pageInputValue, 10) < 1 || parseInt(pageInputValue, 10) > totalPages}
      >
        Go
      </Button>
    </div>
    
    <div class="text-center text-sm text-gray-600 dark:text-gray-400 mt-2">
      Page {currentPage} of {totalPages} • Showing {startIndex + 1}-{endIndex} of {events.length} results
    </div>
  {/if}
</div> 