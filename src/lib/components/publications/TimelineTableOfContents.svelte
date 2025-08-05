<script lang="ts">
  import {
    TableOfContents,
    type TocEntry,
  } from "$lib/components/publications/table_of_contents.svelte";
  import { getContext, onMount, onDestroy } from "svelte";
  import { publicationColumnVisibility } from "$lib/stores";

  let { onSectionFocused, onLoadMore } = $props<{
    onSectionFocused?: (address: string) => void;
    onLoadMore?: () => void;
  }>();

  const toc = getContext("toc") as TableOfContents;

  // Constants
  const MOBILE_BREAKPOINT = 1024; // lg breakpoint
  const TIMELINE_ENTRY_HEIGHT = 40; // pixels
  const INTERSECTION_ROOT_MARGIN = "-20% 0px -20% 0px";
  const INTERSECTION_THRESHOLDS = [0, 0.25, 0.5, 0.75, 1];

  // State for mobile sidebar
  let isMobileView = $state(false);
  let showMobileSidebar = $state(false);
  let sidebarRef = $state<HTMLElement | null>(null);
  let timelineRef = $state<HTMLElement | null>(null);

  // State for timeline
  let isTimelineExpanded = $state(false);
  let currentVisibleSection = $state<string | null>(null);
  let scrollProgress = $state(0);

  // Computed entries for timeline display
  let allEntries = $derived.by<TocEntry[]>(() => {
    const entries = [];
    for (const [_, entry] of toc.addressMap) {
      entries.push(entry);
    }
    return entries.sort((a, b) => {
      // Sort by depth first, then by document order
      if (a.depth !== b.depth) {
        return a.depth - b.depth;
      }
      // For same depth, maintain document order
      return 0;
    });
  });

  let topLevelEntries = $derived(
    allEntries.filter(entry => entry.depth === 2)
  );

  // Intersection observer for tracking visible sections
  let observer: IntersectionObserver;

  function checkMobileView() {
    isMobileView = window.innerWidth < MOBILE_BREAKPOINT;
  }

  function toggleMobileSidebar() {
    showMobileSidebar = !showMobileSidebar;
  }

  function closeMobileSidebar() {
    showMobileSidebar = false;
  }

  function handleSectionClick(address: string) {
    try {
      const element = document.getElementById(address);
      if (element) {
        element.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }
      onSectionFocused?.(address);
      
      // Close mobile sidebar after navigation
      if (isMobileView) {
        closeMobileSidebar();
      }
      
      // Check if this is the last entry and trigger loading more
      const lastEntry = topLevelEntries[topLevelEntries.length - 1];
      if (lastEntry && lastEntry.address === address) {
        console.debug('[TimelineTableOfContents] Last entry clicked, triggering load more');
        onLoadMore?.();
      }
    } catch (error) {
      console.error('[TimelineTableOfContents] Error handling section click:', error);
    }
  }

  let scrollProgressThrottled = $state(false);
  
  function calculateScrollProgress() {
    if (scrollProgressThrottled) return;
    
    scrollProgressThrottled = true;
    requestAnimationFrame(() => {
      try {
        const scrollTop = window.scrollY;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        scrollProgress = Math.min(Math.max(scrollTop / docHeight, 0), 1);
      } catch (error) {
        console.error('[TimelineTableOfContents] Error calculating scroll progress:', error);
      } finally {
        scrollProgressThrottled = false;
      }
    });
  }

  function handleOutsideClick(event: MouseEvent) {
    if (showMobileSidebar && sidebarRef && !sidebarRef.contains(event.target as Node)) {
      closeMobileSidebar();
    }
  }

  function handleResize() {
    checkMobileView();
    if (!isMobileView && showMobileSidebar) {
      showMobileSidebar = false;
    }
  }

  function isEntryVisible(address: string): boolean {
    return currentVisibleSection === address;
  }

  function getEntryChildren(entry: TocEntry): TocEntry[] {
    return allEntries.filter(e => e.parent?.address === entry.address);
  }

  onMount(() => {
    checkMobileView();

    // Set up intersection observer for section tracking
    observer = new IntersectionObserver(
      (entries) => {
        let maxIntersectionRatio = 0;
        let mostVisibleSection: string | null = null;

        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > maxIntersectionRatio) {
            maxIntersectionRatio = entry.intersectionRatio;
            mostVisibleSection = entry.target.id;
          }
        });

        if (mostVisibleSection && mostVisibleSection !== currentVisibleSection) {
          currentVisibleSection = mostVisibleSection;
        }
      },
      {
        threshold: INTERSECTION_THRESHOLDS,
        rootMargin: INTERSECTION_ROOT_MARGIN,
      }
    );

    // Observe all sections
    function observeSections() {
      const sections = document.querySelectorAll('section[id]');
      sections.forEach((section) => {
        observer.observe(section);
      });
    }

    observeSections();

    // Set up mutation observer for new sections
    const mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            if (element.tagName === 'SECTION' && element.id) {
              observer.observe(element);
            }
            const sections = element.querySelectorAll?.('section[id]');
            if (sections) {
              sections.forEach((section) => {
                observer.observe(section);
              });
            }
          }
        });
      });
    });

    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Event listeners
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', calculateScrollProgress);
    document.addEventListener('click', handleOutsideClick);

    return () => {
      observer.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', calculateScrollProgress);
      document.removeEventListener('click', handleOutsideClick);
    };
  });

  onDestroy(() => {
    if (observer) {
      observer.disconnect();
    }
  });
</script>

<!-- Mobile ToC Button -->
{#if isMobileView}
  <button
    class="fixed top-4 left-4 z-50 btn-leather !p-2 lg:hidden"
    onclick={toggleMobileSidebar}
    aria-label="Toggle table of contents"
  >
    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
      <path fill-rule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clip-rule="evenodd"></path>
    </svg>
  </button>

  <!-- Mobile Sidebar -->
  {#if showMobileSidebar}
    <div class="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-labelledby="mobile-toc-title">
      <!-- Backdrop -->
      <div 
        class="fixed inset-0 bg-black bg-opacity-50" 
        onclick={closeMobileSidebar}
        onkeydown={(e) => e.key === 'Escape' && closeMobileSidebar()}
        role="button"
        tabindex="-1"
        aria-label="Close table of contents"
      ></div>
      
      <!-- Sidebar -->
      <div
        bind:this={sidebarRef}
        class="fixed left-0 top-0 h-full w-80 bg-primary-0 dark:bg-primary-1000 shadow-xl transform transition-transform duration-300 ease-in-out translate-x-0 overflow-y-auto"
        role="navigation"
        aria-label="Table of Contents"
      >
        <div class="p-4">
          <div class="flex justify-between items-center mb-4">
            <h2 id="mobile-toc-title" class="text-lg font-semibold text-gray-900 dark:text-gray-100">Table of Contents</h2>
            <button
              onclick={closeMobileSidebar}
              class="btn-leather !p-1"
              aria-label="Close table of contents"
            >
              <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path>
              </svg>
            </button>
          </div>
          
          <!-- Mobile ToC Entries -->
          <nav class="space-y-1">
            {#each topLevelEntries as entry}
              {@const isVisible = isEntryVisible(entry.address)}
              {@const children = getEntryChildren(entry)}
              
              <div class="space-y-1">
                <button
                  onclick={() => handleSectionClick(entry.address)}
                  class="w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200 {isVisible 
                    ? 'bg-primary-200 dark:bg-primary-700 text-primary-800 dark:text-primary-200' 
                    : 'text-gray-700 dark:text-gray-300 hover:bg-primary-100 dark:hover:bg-primary-800'}"
                >
                  {entry.title}
                </button>
                
                <!-- Child entries -->
                {#if children.length > 0}
                  <div class="ml-4 space-y-1">
                    {#each children as child}
                      {@const isChildVisible = isEntryVisible(child.address)}
                      <button
                        onclick={() => handleSectionClick(child.address)}
                        class="w-full text-left px-3 py-1.5 rounded-md text-xs transition-colors duration-200 {isChildVisible
                          ? 'bg-primary-100 dark:bg-primary-800 text-primary-700 dark:text-primary-300'
                          : 'text-gray-600 dark:text-gray-400 hover:bg-primary-50 dark:hover:bg-primary-900'}"
                      >
                        {child.title}
                      </button>
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}
          </nav>
        </div>
      </div>
    </div>
  {/if}
{/if}

<!-- Desktop Timeline -->
{#if !isMobileView && topLevelEntries.length > 0}
  <div
    bind:this={timelineRef}
    class="fixed left-4 top-1/2 transform -translate-y-1/2 z-30 timeline-container"
    role="navigation"
    aria-label="Article timeline"
    onmouseenter={() => isTimelineExpanded = true}
    onmouseleave={() => isTimelineExpanded = false}
  >
    <!-- Timeline line -->
    <div class="relative">
      <div class="timeline-line absolute left-2 top-0 w-0.5 bg-gray-300 dark:bg-gray-600" 
           style="height: {topLevelEntries.length * TIMELINE_ENTRY_HEIGHT}px;">
        <!-- Progress indicator -->
        <div 
          class="timeline-progress absolute left-0 top-0 w-0.5 bg-primary-600 dark:bg-primary-400 transition-all duration-300 ease-out"
          style="height: {scrollProgress * topLevelEntries.length * TIMELINE_ENTRY_HEIGHT}px;"
        ></div>
      </div>
      
      <!-- Timeline entries -->
      <div class="relative">
        {#each topLevelEntries as entry, index}
          {@const isVisible = isEntryVisible(entry.address)}
          {@const y = index * TIMELINE_ENTRY_HEIGHT}
          
          <div 
            class="timeline-entry absolute flex items-center"
            style="top: {y}px; left: 0;"
          >
            <!-- Timeline dot -->
            <button
              onclick={() => handleSectionClick(entry.address)}
              class="timeline-dot relative z-10 w-4 h-4 rounded-full border-2 transition-all duration-200 {isVisible
                ? 'bg-primary-600 dark:bg-primary-400 border-primary-600 dark:border-primary-400 scale-125'
                : 'bg-white dark:bg-gray-800 border-gray-400 dark:border-gray-500 hover:border-primary-500 dark:hover:border-primary-400'}"
              aria-label="Go to {entry.title}"
            >
              <span class="sr-only">{entry.title}</span>
            </button>
            
            <!-- Timeline label (shown on hover) -->
            <div 
              class="timeline-label ml-4 px-3 py-1.5 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-600 whitespace-nowrap transition-all duration-200 {isTimelineExpanded 
                ? 'opacity-100 translate-x-0' 
                : 'opacity-0 -translate-x-2 pointer-events-none'}"
            >
              <span class="text-sm font-medium text-gray-900 dark:text-gray-100">
                {entry.title}
              </span>
            </div>
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .timeline-container {
    transition: all 0.3s ease-in-out;
  }
  
  .timeline-line {
    transition: all 0.3s ease-in-out;
  }
  
  .timeline-dot {
    cursor: pointer;
  }
  
  .timeline-dot:hover {
    transform: scale(1.1);
  }
  
  .timeline-label {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  /* Ensure mobile sidebar slides in smoothly */
  @media (max-width: 1023px) {
    .timeline-container {
      display: none;
    }
  }
</style>