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
    Textarea,
    Popover,
    P,
    Modal,
  } from "flowbite-svelte";
  import { getContext, onDestroy, onMount } from "svelte";
  import {
    CloseOutline,
    ExclamationCircleOutline,
    MessageDotsOutline,
    FilePenOutline,
    DotsVerticalOutline,
    EyeOutline,
    EyeSlashOutline,
    ClipboardCleanOutline,
    TrashBinOutline,
  } from "flowbite-svelte-icons";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";
  import PublicationSection from "./PublicationSection.svelte";
  import Details from "$components/util/Details.svelte";
  import CopyToClipboard from "$components/util/CopyToClipboard.svelte";
  import { neventEncode, naddrEncode } from "$lib/utils";
  import { publicationColumnVisibility } from "$lib/stores";
  import BlogHeader from "$components/cards/BlogHeader.svelte";
  import type { SveltePublicationTree } from "./svelte_publication_tree.svelte";
  import TableOfContents from "./TableOfContents.svelte";
  import type { TableOfContents as TocType } from "./table_of_contents.svelte";
  import ArticleNav from "$components/util/ArticleNav.svelte";
  import { deleteEvent } from "$lib/services/deletion";
  import { getNdkContext, activeOutboxRelays } from "$lib/ndk";
  import { goto } from "$app/navigation";
  import { getMatchingTags } from "$lib/utils/nostrUtils";
  import HighlightLayer from "./HighlightLayer.svelte";
  import HighlightSelectionHandler from "./HighlightSelectionHandler.svelte";
  import CommentLayer from "./CommentLayer.svelte";
  import SectionComments from "./SectionComments.svelte";
  import { userStore } from "$lib/stores/userStore";
  import CardActions from "$components/util/CardActions.svelte";

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
  
  // Publication header actions menu state
  let publicationActionsOpen = $state(false);
  let detailsModalOpen = $state(false);

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
  let sentinelRef = $state<HTMLElement | null>(null);
  let topSentinelRef = $state<HTMLElement | null>(null);
  let activeAddress = $state<string | null>(null);
  let loadedAddresses = $state<Set<string>>(new Set());
  let hasInitialized = $state(false);
  let highlightModeActive = $state(false);
  let publicationDeleted = $state(false);
  let sidebarTop = $state(162); // Default to 162px (100px navbar + 62px ArticleNav)
  
  // AI-NOTE: Cooldown to prevent rapid re-triggering of loadMore
  let lastLoadTime = $state<number>(0);
  let lastLoadBeforeTime = $state<number>(0);
  let lastLoadBeforeAddress = $state<string | null>(null);
  let justLoadedBefore = $state<boolean>(false); // Flag to prevent immediate re-triggering
  const LOAD_COOLDOWN_MS = 2000; // Increased to 2 seconds to prevent loops

  // AI-NOTE: Batch loading configuration for improved lazy-loading
  // Initial load fills ~2 viewport heights, auto-load batches for smooth infinite scroll
  const INITIAL_LOAD_COUNT = 30;
  const AUTO_LOAD_BATCH_SIZE = 25;
  
  // AI-NOTE: Jump-to-section configuration
  const JUMP_WINDOW_SIZE = 5; // Load 5 sections before and 5 after the target

  /**
   * Loads more events from the publication tree.
   * 
   * @param count Number of events to load in this batch
   */
  async function loadMore(count: number) {
    if (!publicationTree) {
      console.warn("[Publication] publicationTree is not available");
      return;
    }

    if (isLoading) {
      console.debug("[Publication] Already loading, skipping");
      return;
    }

    // Cooldown check to prevent rapid re-triggering
    const now = Date.now();
    const timeSinceLastLoad = now - lastLoadTime;
    if (timeSinceLastLoad < LOAD_COOLDOWN_MS) {
      console.debug(`[Publication] Load cooldown active (${timeSinceLastLoad}ms < ${LOAD_COOLDOWN_MS}ms), skipping`);
      return;
    }

    if (isDone) {
      console.debug("[Publication] Already done, skipping loadMore");
      return;
    }

    console.log(
      `[Publication] Auto-loading ${count} more events. Current leaves: ${leaves.length}, loaded addresses: ${loadedAddresses.size}`,
    );

    isLoading = true;
    lastLoadTime = now;

    try {
      const newEvents: Array<NDKEvent | null> = [];
      let consecutiveNulls = 0;
      const MAX_CONSECUTIVE_NULLS = 10; // Break if we get too many nulls in a row
      const LOAD_TIMEOUT = 30000; // 30 second timeout per load operation
      
      // Create a timeout promise to prevent hanging
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Load timeout after ${LOAD_TIMEOUT}ms`));
        }, LOAD_TIMEOUT);
      });
      
      // Load events sequentially to maintain order, but build batches for TOC updates
      for (let i = 0; i < count; i++) {
        try {
          const iterResult = await Promise.race([
            publicationTree.next(),
            timeoutPromise,
          ]);
          
          const { done, value } = iterResult;

          if (done) {
            console.log("[Publication] Iterator done, no more events");
            isDone = true;
            break;
          }

          if (value) {
            consecutiveNulls = 0; // Reset null counter
            const address = value.tagAddress();
            if (!loadedAddresses.has(address)) {
              loadedAddresses.add(address);
              newEvents.push(value);
              console.debug(`[Publication] Queued event: ${address} (${value.id})`);
            } else {
              console.warn(`[Publication] Duplicate event detected: ${address}`);
              newEvents.push(null); // Keep index consistent
            }
          } else {
            consecutiveNulls++;
            console.log(`[Publication] Got null event (${consecutiveNulls}/${MAX_CONSECUTIVE_NULLS} consecutive nulls)`);
            
            // Break early if we're getting too many nulls - likely no more content
            if (consecutiveNulls >= MAX_CONSECUTIVE_NULLS) {
              console.log("[Publication] Too many consecutive null events, assuming no more content");
              isDone = true;
              break;
            }
            
            newEvents.push(null);
          }
        } catch (error) {
          console.error(`[Publication] Error getting next event (iteration ${i + 1}/${count}):`, error);
          // Continue to next iteration instead of breaking entirely
          newEvents.push(null);
          consecutiveNulls++;
          
          if (consecutiveNulls >= MAX_CONSECUTIVE_NULLS) {
            console.log("[Publication] Too many errors/consecutive nulls, stopping load");
            break;
          }
        }
      }

      // Add all new events at once for better performance and to trigger TOC updates in parallel
      const validEvents = newEvents.filter(e => e !== null);
      if (validEvents.length > 0) {
        const previousLeavesCount = leaves.length;
        leaves = [...leaves, ...newEvents];
        console.log(
          `[Publication] Added ${validEvents.length} events. Previous: ${previousLeavesCount}, Total: ${leaves.length}`,
        );
        
        // Log sentinel position after adding content
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (sentinelRef) {
              const rect = sentinelRef.getBoundingClientRect();
              const viewportHeight = window.innerHeight;
              const distanceBelowViewport = rect.top - viewportHeight;
              console.log("[Publication] Sentinel position after loadMore", {
                leavesCount: leaves.length,
                sentinelTop: rect.top,
                viewportHeight,
                distanceBelowViewport,
                isConnected: sentinelRef.isConnected,
              });
            }
          });
        });
      } else if (newEvents.length > 0) {
        // We got through the loop but no valid events - might be done
        console.log("[Publication] Completed load but got no valid events", {
          newEventsLength: newEvents.length,
          consecutiveNulls,
        });
        if (consecutiveNulls >= MAX_CONSECUTIVE_NULLS) {
          isDone = true;
        }
      } else {
        console.warn("[Publication] loadMore completed but no events were loaded", {
          count,
          newEventsLength: newEvents.length,
          validEventsLength: validEvents.length,
        });
      }
    } catch (error) {
      console.error("[Publication] Error loading more content:", error);
      // Don't mark as done on error - might be transient network issue
    } finally {
      isLoading = false;
      console.log(`[Publication] Load complete. isLoading: ${isLoading}, isDone: ${isDone}, leaves: ${leaves.length}`);
      
      // AI-NOTE: The ResizeObserver effect will handle checking sentinel position
      // after content actually renders, so we don't need aggressive post-load checks here
    }
  }

  /**
   * Loads sections before a given address in the TOC order.
   * 
   * @param referenceAddress The address to load sections before
   * @param count Number of sections to load
   */
  async function loadSectionsBefore(referenceAddress: string, count: number = AUTO_LOAD_BATCH_SIZE) {
    if (!publicationTree || !toc || isLoading) {
      return;
    }

    // Cooldown check to prevent rapid re-triggering
    const now = Date.now();
    const timeSinceLastLoad = now - lastLoadBeforeTime;
    if (timeSinceLastLoad < LOAD_COOLDOWN_MS) {
      console.debug(`[Publication] Load before cooldown active (${timeSinceLastLoad}ms < ${LOAD_COOLDOWN_MS}ms), skipping`);
      return;
    }

    // Prevent loading the same address repeatedly
    if (lastLoadBeforeAddress === referenceAddress && timeSinceLastLoad < LOAD_COOLDOWN_MS * 2) {
      console.debug(`[Publication] Already loading before ${referenceAddress}, skipping`);
      return;
    }

    // Get all addresses from TOC in depth-first order
    const allAddresses: string[] = [];
    for (const entry of toc) {
      allAddresses.push(entry.address);
    }

    const referenceIndex = allAddresses.indexOf(referenceAddress);
    if (referenceIndex === -1) {
      console.warn(`[Publication] Reference address ${referenceAddress} not found in TOC`);
      return;
    }

    // Check if we've reached the beginning
    if (referenceIndex === 0) {
      console.debug(`[Publication] Already at beginning of publication, no more sections to load before`);
      return;
    }

    // Get addresses before the reference
    const startIndex = Math.max(0, referenceIndex - count);
    const addressesToLoad = allAddresses.slice(startIndex, referenceIndex).reverse(); // Reverse to load closest first

    // Filter out already loaded addresses
    const addressesToLoadFiltered = addressesToLoad.filter(addr => !loadedAddresses.has(addr));
    
    if (addressesToLoadFiltered.length === 0) {
      console.debug(`[Publication] All sections before ${referenceAddress} are already loaded`);
      return;
    }

    console.log(`[Publication] Loading ${addressesToLoadFiltered.length} sections before ${referenceAddress}`);

    isLoading = true;
    lastLoadBeforeTime = now;
    lastLoadBeforeAddress = referenceAddress;
    const newEvents: Array<NDKEvent | null> = [];

    for (const address of addressesToLoadFiltered) {
      try {
        const event = await publicationTree.getEvent(address);
        if (event) {
          newEvents.push(event);
          loadedAddresses.add(address);
        } else {
          newEvents.push(null);
        }
      } catch (error) {
        console.error(`[Publication] Error loading section ${address}:`, error);
        newEvents.push(null);
      }
    }

    // Insert at the beginning of leaves array
    const validEvents = newEvents.filter(e => e !== null);
    if (validEvents.length > 0) {
      leaves = [...newEvents.reverse(), ...leaves]; // Reverse back to maintain order
      console.log(`[Publication] Loaded ${validEvents.length} sections before ${referenceAddress}`);
      
      // Set flag to prevent immediate re-triggering
      justLoadedBefore = true;
      setTimeout(() => {
        justLoadedBefore = false;
      }, LOAD_COOLDOWN_MS * 2); // Keep flag for 4 seconds
      
      // Note: setupObserver runs periodically and will pick up the new first section
    } else {
      // No new sections loaded - clear the tracking to allow retry later
      lastLoadBeforeAddress = null;
      justLoadedBefore = false;
    }

    isLoading = false;
  }

  /**
   * Loads sections after a given address in the TOC order.
   * 
   * @param referenceAddress The address to load sections after
   * @param count Number of sections to load
   */
  async function loadSectionsAfter(referenceAddress: string, count: number = AUTO_LOAD_BATCH_SIZE) {
    if (!publicationTree || !toc || isLoading) {
      return;
    }

    // Get all addresses from TOC in depth-first order
    const allAddresses: string[] = [];
    for (const entry of toc) {
      allAddresses.push(entry.address);
    }

    const referenceIndex = allAddresses.indexOf(referenceAddress);
    if (referenceIndex === -1) {
      console.warn(`[Publication] Reference address ${referenceAddress} not found in TOC`);
      return;
    }

    // Get addresses after the reference
    const endIndex = Math.min(allAddresses.length - 1, referenceIndex + count);
    const addressesToLoad = allAddresses.slice(referenceIndex + 1, endIndex + 1);

    console.log(`[Publication] Loading ${addressesToLoad.length} sections after ${referenceAddress}`);

    isLoading = true;
    const newEvents: Array<NDKEvent | null> = [];

    for (const address of addressesToLoad) {
      // Skip if already loaded
      if (loadedAddresses.has(address)) {
        continue;
      }

      try {
        const event = await publicationTree.getEvent(address);
        if (event) {
          newEvents.push(event);
          loadedAddresses.add(address);
        } else {
          newEvents.push(null);
        }
      } catch (error) {
        console.error(`[Publication] Error loading section ${address}:`, error);
        newEvents.push(null);
      }
    }

    // Find where to insert in leaves array (after the reference address)
    if (newEvents.length > 0) {
      const referenceIndexInLeaves = leaves.findIndex(
        leaf => leaf?.tagAddress() === referenceAddress
      );
      
      if (referenceIndexInLeaves !== -1) {
        // Insert after the reference
        const before = leaves.slice(0, referenceIndexInLeaves + 1);
        const after = leaves.slice(referenceIndexInLeaves + 1);
        leaves = [...before, ...newEvents, ...after];
      } else {
        // Reference not in leaves, append to end
        leaves = [...leaves, ...newEvents];
      }
      
      console.log(`[Publication] Loaded ${newEvents.filter(e => e !== null).length} sections after ${referenceAddress}`);
    }

    isLoading = false;
  }

  /**
   * Jumps to a specific section and loads a window of sections around it.
   * This allows users to jump forward to sections that haven't been rendered yet.
   * 
   * @param targetAddress The address of the section to jump to
   * @param windowSize Number of sections to load before and after the target (default: JUMP_WINDOW_SIZE)
   */
  async function jumpToSection(targetAddress: string, windowSize: number = JUMP_WINDOW_SIZE) {
    if (!publicationTree || !toc) {
      console.warn("[Publication] publicationTree or toc not available for jump-to-section");
      return;
    }

    // Check if target is already loaded
    const alreadyLoaded = leaves.some(leaf => leaf?.tagAddress() === targetAddress);
    if (alreadyLoaded) {
      console.log(`[Publication] Section ${targetAddress} already loaded, scrolling to it`);
      // Scroll to the section
      const element = document.getElementById(targetAddress);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }

    console.log(`[Publication] Jumping to section ${targetAddress} with window size ${windowSize}`);

    // Get all addresses from TOC in depth-first order
    const allAddresses: string[] = [];
    for (const entry of toc) {
      allAddresses.push(entry.address);
    }

    // Find target address index
    const targetIndex = allAddresses.indexOf(targetAddress);
    if (targetIndex === -1) {
      console.warn(`[Publication] Target address ${targetAddress} not found in TOC`);
      return;
    }

    // Calculate window bounds
    const startIndex = Math.max(0, targetIndex - windowSize);
    const endIndex = Math.min(allAddresses.length - 1, targetIndex + windowSize);
    const windowAddresses = allAddresses.slice(startIndex, endIndex + 1);

    console.log(`[Publication] Loading window: ${windowAddresses.length} sections (indices ${startIndex}-${endIndex})`);

    // Load events for the window
    const windowEvents: Array<{ address: string; event: NDKEvent | null; index: number }> = [];
    for (const address of windowAddresses) {
      // Skip if already loaded
      if (loadedAddresses.has(address)) {
        continue;
      }

      try {
        const event = await publicationTree.getEvent(address);
        if (event) {
          windowEvents.push({ address, event, index: allAddresses.indexOf(address) });
          loadedAddresses.add(address);
        }
      } catch (error) {
        console.error(`[Publication] Error loading section ${address}:`, error);
      }
    }

    // Insert events into leaves array at correct positions
    // We need to maintain order based on TOC order
    const newLeaves = [...leaves];
    
    for (const { address, event, index } of windowEvents) {
      // Find where to insert this event in the leaves array
      // We want to insert it at a position that maintains TOC order
      let insertIndex = newLeaves.length;
      
      // Find the first position where the next address in TOC order appears
      for (let i = 0; i < newLeaves.length; i++) {
        const leafAddress = newLeaves[i]?.tagAddress();
        if (leafAddress) {
          const leafIndex = allAddresses.indexOf(leafAddress);
          if (leafIndex > index) {
            insertIndex = i;
            break;
          }
        }
      }
      
      // Insert the event at the calculated position
      newLeaves.splice(insertIndex, 0, event);
      console.log(`[Publication] Inserted section ${address} at position ${insertIndex}`);
    }

    // Update leaves array
    leaves = newLeaves;

    // Set bookmark to target address for future sequential loading
    publicationTree.setBookmark(targetAddress);

    // Scroll to target section after a short delay to allow rendering
    setTimeout(() => {
      const element = document.getElementById(targetAddress);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);

    console.log(`[Publication] Jump-to-section complete. Loaded ${windowEvents.length} sections around ${targetAddress}`);
  }

  /**
   * Background-loads all events in the publication tree in breadth-first order (level by level).
   * This ensures the TOC is fully populated with all sections.
   * 
   * Loads: root -> level 1 children -> level 2 children -> etc.
   * Also resolves children for each entry to establish parent relationships in TOC.
   * 
   * AI-NOTE: Throttled to avoid blocking main publication loading. Processes in small batches
   * with delays to prevent overwhelming relays.
   */
  async function backgroundLoadAllEvents() {
    if (!publicationTree || !toc) {
      console.warn("[Publication] publicationTree or toc is not available for background loading");
      return;
    }

    console.log("[Publication] Starting background load of all events in level-layers (throttled)");
    
    // Throttling configuration
    const BATCH_SIZE = 10; // Process 3 addresses at a time
    const BATCH_DELAY_MS = 200; // 200ms delay between batches
    const LEVEL_DELAY_MS = 500; // 500ms delay between levels
    
    // Track which addresses we've processed to avoid duplicates
    const processedAddresses = new Set<string>();
    
    // Start with root address
    const queue: string[] = [rootAddress];
    processedAddresses.add(rootAddress);
    
    // Process level by level (breadth-first)
    while (queue.length > 0) {
      const currentLevelAddresses = [...queue];
      queue.length = 0; // Clear queue for next level
      
      // Process addresses in small batches to avoid overwhelming relays
      for (let i = 0; i < currentLevelAddresses.length; i += BATCH_SIZE) {
        const batch = currentLevelAddresses.slice(i, i + BATCH_SIZE);
        
        // Process batch in parallel
        const batchPromises = batch.map(async (address) => {
          try {
            // Get child addresses for this node - this triggers node resolution
            const childAddresses = await publicationTree.getChildAddresses(address);
            
            // Resolve children for this entry to establish parent relationships in TOC
            const entry = toc.getEntry(address);
            if (entry && !entry.childrenResolved) {
              await entry.resolveChildren();
            }
            
            // Add valid children to queue for next level
            for (const childAddress of childAddresses) {
              if (childAddress && !processedAddresses.has(childAddress)) {
                processedAddresses.add(childAddress);
                queue.push(childAddress);
                
                // Resolve the child event to populate TOC (non-blocking)
                publicationTree.getEvent(childAddress).catch((error: unknown) => {
                  console.debug(`[Publication] Error fetching child event ${childAddress}:`, error);
                });
              }
            }
          } catch (error) {
            console.error(`[Publication] Error loading children for ${address}:`, error);
          }
        });
        
        // Wait for batch to complete
        await Promise.all(batchPromises);
        
        // Small delay between batches to avoid blocking main loading
        if (i + BATCH_SIZE < currentLevelAddresses.length) {
          await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
        }
      }
      
      console.log(`[Publication] Completed level, processed ${currentLevelAddresses.length} addresses, queued ${queue.length} for next level`);
      
      // Delay between levels to give main loading priority
      if (queue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, LEVEL_DELAY_MS));
      }
    }
    
    console.log("[Publication] Background load complete, processed", processedAddresses.size, "addresses");
  }

  // #endregion

  // AI-NOTE: Combined effect to handle publicationTree changes and initial loading
  // This prevents conflicts between separate effects that could cause duplicate loading
  let publicationTreeInstance = $state<SveltePublicationTree | null>(null);
  
  $effect(() => {
    if (!publicationTree) {
      return;
    }

    // Only reset if publicationTree actually changed (different instance)
    if (publicationTree === publicationTreeInstance && hasInitialized) {
      return; // Already initialized with this tree, don't reset
    }

    console.log("[Publication] New publication tree detected, resetting state");
    
    // Reset state when publicationTree changes
    leaves = [];
    isLoading = false;
    isDone = false;
    sentinelRef = null;
    loadedAddresses = new Set();
    hasInitialized = false;
    publicationTreeInstance = publicationTree;

    // Reset the publication tree iterator to prevent duplicate events
    if (typeof publicationTree.resetIterator === "function") {
      publicationTree.resetIterator();
    }

    // Load initial content after reset
    console.log("[Publication] Loading initial content");
    hasInitialized = true;
    loadMore(INITIAL_LOAD_COUNT);
    
    // Start background loading all events in level-layers for TOC
    // This runs in the background and doesn't block the UI
    // Wait a bit for toc to be initialized
    setTimeout(() => {
      if (toc && publicationTree) {
        backgroundLoadAllEvents().catch((error) => {
          console.error("[Publication] Error in background loading:", error);
        });
      } else {
        console.warn("[Publication] toc or publicationTree not available for background loading");
      }
    }, 100);
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

  function viewDetails() {
    detailsModalOpen = true;
    publicationActionsOpen = false;
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
    // AI-NOTE: Using sentinel element for intersection observer instead of tracking last element
    // The sentinel is a dedicated element placed after all sections for better performance

    // Michael J - 08 July 2025 - NOTE: Updating the ToC from here somewhat breaks separation of
    // concerns, since the TableOfContents component is primarily responsible for working with the
    // ToC data structure. However, the Publication component has direct access to the needed DOM
    // element already, and I want to avoid complicated callbacks between the two components.
    // Update the ToC from the contents of the leaf section.
    // AI-NOTE: TOC updates happen in parallel as sections mount, improving performance
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
    // Measure the actual navbar and ArticleNav heights to position sidebars correctly
    const navbar = document.getElementById("navi");
    const articleNav = document.querySelector("nav.navbar-leather");
    
    if (navbar && articleNav) {
      const navbarRect = navbar.getBoundingClientRect();
      const articleNavRect = articleNav.getBoundingClientRect();
      sidebarTop = articleNavRect.bottom;
    } else if (navbar) {
      // Fallback: if ArticleNav not found, use navbar height + estimated ArticleNav height
      const navbarRect = navbar.getBoundingClientRect();
      sidebarTop = navbarRect.bottom + 62; // Estimated ArticleNav height
    }

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
  });

  // Setup highlight layer container reference
  $effect(() => {
    if (publicationContentRef && highlightLayerRef) {
      highlightLayerRef.setContainer(publicationContentRef);
    }
  });

  // AI-NOTE: Simple IntersectionObserver-based infinite scroll
  // Uses a single, reliable mechanism to detect when sentinel is near viewport
  // Queries DOM directly to avoid bind:this timing issues
  $effect(() => {
    // Track reactive dependencies
    const initialized = hasInitialized;
    const tree = publicationTree;
    
    // Early return if not ready
    if (!initialized || !tree) {
      return;
    }

    let observer: IntersectionObserver | null = null;
    let checkInterval: number | null = null;
    let setupInterval: number | null = null;
    let isSetup = false;
    
    const getSentinel = (): HTMLElement | null => {
      return document.getElementById("publication-sentinel");
    };
    
    const getTopSentinel = (): HTMLElement | null => {
      return document.getElementById("publication-top-sentinel");
    };
    
    let lastCheckTime = 0;
    const CHECK_COOLDOWN_MS = 2000; // Only check every 2 seconds to prevent loops
    
    const checkAndLoad = () => {
      // Cooldown check to prevent rapid checking
      const now = Date.now();
      if (now - lastCheckTime < CHECK_COOLDOWN_MS) {
        return;
      }
      lastCheckTime = now;
      
      if (isLoading || isDone || !toc) {
        return;
      }
      
      // Check bottom sentinel for loading more sections after
      const bottomSentinel = getSentinel();
      if (bottomSentinel && bottomSentinel.isConnected) {
        const rect = bottomSentinel.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const distanceBelowViewport = rect.top - viewportHeight;
        
        // Load if sentinel is within 1000px of viewport
        if (distanceBelowViewport <= 1000 && distanceBelowViewport > -100) {
          // Find the last loaded section
          const lastLoadedSection = leaves.filter(l => l !== null).slice(-1)[0];
          if (lastLoadedSection) {
            const lastAddress = lastLoadedSection.tagAddress();
            console.log("[Publication] Bottom sentinel near viewport, loading more after", lastAddress);
            loadSectionsAfter(lastAddress, AUTO_LOAD_BATCH_SIZE);
          } else {
            loadMore(AUTO_LOAD_BATCH_SIZE);
          }
        }
      }
      
      // Check if we're near the top - load sections before when scrolling up
      const firstLoadedSection = leaves.filter(l => l !== null)[0];
      
      if (firstLoadedSection) {
        const firstAddress = firstLoadedSection.tagAddress();
        
        // Check if we're at the beginning - don't load if first section is the root
        if (firstAddress === rootAddress) {
          // Already at beginning, skip
          return;
        }
        
        const firstSectionElement = document.getElementById(firstAddress);
        if (firstSectionElement) {
          const rect = firstSectionElement.getBoundingClientRect();
          const distanceFromTop = rect.top;
          const scrollY = window.scrollY || window.pageYOffset;
          
          // Load if:
          // 1. First section is visible or near viewport (within 2000px below top), OR
          // 2. First section is above viewport but within 3000px (user scrolling up toward it), OR
          // 3. User has scrolled near the top of the document (scrollY < 1000) and first section is above viewport
          const isNearOrVisible = distanceFromTop <= 2000 && distanceFromTop > -100;
          const isAboveButClose = distanceFromTop < -100 && distanceFromTop > -3000;
          const isScrolledToTop = scrollY < 1000 && distanceFromTop < 0;
          
          if (isNearOrVisible || isAboveButClose || isScrolledToTop) {
            // Double-check we're not already loading, haven't just loaded, and haven't just loaded before
            if (!isLoading && !justLoadedBefore && lastLoadBeforeAddress !== firstAddress) {
              console.log("[Publication] checkAndLoad: First section near viewport, loading more before", firstAddress, {
                distanceFromTop,
                scrollY,
                firstSectionTop: rect.top,
                viewportHeight: window.innerHeight,
                isNearOrVisible,
                isAboveButClose,
                isScrolledToTop,
              });
              loadSectionsBefore(firstAddress, AUTO_LOAD_BATCH_SIZE);
            } else {
              console.debug("[Publication] checkAndLoad: Skipping", {
                isLoading,
                justLoadedBefore,
                lastLoadBeforeAddress,
                firstAddress,
              });
            }
          } else {
            console.debug("[Publication] checkAndLoad: First section not near enough", {
              firstAddress,
              distanceFromTop,
              scrollY,
              threshold: "2000px to -3000px or scrollY < 1000",
            });
          }
        } else {
          console.debug("[Publication] checkAndLoad: First section element not found in DOM", firstAddress);
        }
      } else {
        console.debug("[Publication] checkAndLoad: No first loaded section");
      }
    };
    
    const setupObserver = () => {
      if (isSetup || !hasInitialized || !publicationTree) {
        return;
      }
      
      const sentinel = getSentinel();
      const topSentinel = getTopSentinel();
      
      // Need at least one sentinel to be ready
      if ((!sentinel || !sentinel.isConnected) && (!topSentinel || !topSentinel.isConnected)) {
        return;
      }

      // Already set up
      if (observer) {
        return;
      }

      console.log("[Publication] Setting up IntersectionObserver for infinite scroll", {
        hasBottomSentinel: !!sentinel,
        hasTopSentinel: !!topSentinel,
        bottomSentinelConnected: sentinel?.isConnected,
        topSentinelConnected: topSentinel?.isConnected,
      });

      observer = new IntersectionObserver(
        (entries) => {
          // Check current state
          if (isLoading || isDone || !toc) {
            return;
          }
          
          for (const entry of entries) {
            if (entry.isIntersecting) {
              const sentinelId = entry.target.id;
              
              if (sentinelId === "publication-sentinel") {
                // Bottom sentinel - load sections after
                const lastLoadedSection = leaves.filter(l => l !== null).slice(-1)[0];
                if (lastLoadedSection) {
                  const lastAddress = lastLoadedSection.tagAddress();
                  console.log("[Publication] Bottom sentinel intersecting, loading more after", lastAddress);
                  loadSectionsAfter(lastAddress, AUTO_LOAD_BATCH_SIZE);
                } else {
                  loadMore(AUTO_LOAD_BATCH_SIZE);
                }
              } else if (sentinelId === "publication-top-sentinel") {
                // Top sentinel - load sections before
                const firstLoadedSection = leaves.filter(l => l !== null)[0];
                if (firstLoadedSection) {
                  const firstAddress = firstLoadedSection.tagAddress();
                  // Don't load if we're at the root
                  if (firstAddress !== rootAddress) {
                    console.log("[Publication] Top sentinel intersecting, loading more before", firstAddress);
                    loadSectionsBefore(firstAddress, AUTO_LOAD_BATCH_SIZE);
                  }
                }
              } else {
                // Check if this is the first section element
                const firstLoadedSection = leaves.filter(l => l !== null)[0];
                if (firstLoadedSection && entry.target.id === firstLoadedSection.tagAddress()) {
                  const firstAddress = firstLoadedSection.tagAddress();
                  // Don't load if we're at the root
                  if (firstAddress !== rootAddress) {
                    console.log("[Publication] First section intersecting near top, loading more before", firstAddress);
                    loadSectionsBefore(firstAddress, AUTO_LOAD_BATCH_SIZE);
                  }
                }
              }
              break;
            }
          }
        },
        {
          // Trigger when sentinel is 2000px from viewport (above or below)
          // Larger margin for upward scrolling detection
          rootMargin: "2000px 0px 2000px 0px",
          threshold: 0,
        },
      );

      // Observe both sentinels
      if (sentinel) {
        observer.observe(sentinel);
      }
      if (topSentinel) {
        observer.observe(topSentinel);
      }
      
      // Also observe the first section element if available
      const firstLoadedSection = leaves.filter(l => l !== null)[0];
      if (firstLoadedSection) {
        const firstSectionElement = document.getElementById(firstLoadedSection.tagAddress());
        if (firstSectionElement) {
          observer.observe(firstSectionElement);
        }
      }
      
      isSetup = true;
      
      // Clear setup interval since we're now set up
      if (setupInterval !== null) {
        clearInterval(setupInterval);
        setupInterval = null;
      }
      
      console.log("[Publication] Observing sentinels", {
        hasBottomSentinel: !!sentinel,
        hasTopSentinel: !!topSentinel,
        viewportHeight: window.innerHeight,
      });
    };

    // Try to set up immediately
    setupObserver();
    
    // Poll to set up observer when sentinel becomes available
    setupInterval = window.setInterval(setupObserver, 100);
    
    // Fallback: check periodically in case IntersectionObserver doesn't fire
    // Increased interval to 3 seconds to prevent loops (cooldown is 2 seconds)
    checkInterval = window.setInterval(checkAndLoad, 3000);

    // Cleanup
    return () => {
      if (setupInterval !== null) {
        clearInterval(setupInterval);
      }
      if (checkInterval !== null) {
        clearInterval(checkInterval);
      }
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      isSetup = false;
      console.log("[Publication] Cleaned up IntersectionObserver");
    };
  });

  // #endregion
</script>

<!-- Add gap & items-start so sticky sidebars size correctly -->
<div
  class="relative grid gap-4 items-start grid-cols-1 grid-rows-[auto_1fr] overflow-x-hidden"
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
  <div class="contents">
    <!-- Table of contents column removed - using overlay drawer instead -->
    <div class="mt-[70px] w-full max-w-full md:max-w-7xl mx-auto">
      <!-- Default publications -->
      {#if $publicationColumnVisibility.main}
        <!-- Remove overflow-auto so page scroll drives it -->
        <div
          class="flex flex-col p-4 space-y-4 max-w-3xl flex-grow-2 mx-auto text-left"
          bind:this={publicationContentRef}
        >
          <!-- Publication header with comments (similar to section layout) -->
          <div class="relative">
            <!-- Main header content - centered -->
            <div class="max-w-4xl mx-auto px-4">
              <div
                class="card-leather bg-highlight dark:bg-primary-900 p-4 mb-4 rounded-lg border relative"
                id={rootAddress}
              >
                <Details
                  event={indexEvent}
                  onDelete={handleDeletePublication}
                  hideActions={true}
                />
                
                <!-- Publication actions menu button - positioned at top-right -->
                <div 
                  class="absolute top-2 right-2 card-actions z-0"
                  role="button"
                  tabindex={0}
                  onclick={(e) => e.stopPropagation()}
                  onkeydown={(e) => e.stopPropagation()}
                >
                  <div
                    class="group bg-transparent rounded relative"
                    role="group"
                    onmouseenter={() => (publicationActionsOpen = true)}
                  >
                    <Button
                      type="button"
                      id="publication-actions"
                      class="!bg-transparent hover:!bg-primary-100 dark:hover:!bg-primary-800 text-primary-600 dark:text-gray-300 hover:text-primary-700 dark:hover:text-gray-200 p-1 dots !border-0 !shadow-none"
                      data-popover-target="popover-publication-actions"
                    >
                      <DotsVerticalOutline class="h-6 w-6" />
                      <span class="sr-only">Open publication actions menu</span>
                    </Button>

                    {#if publicationActionsOpen}
                      <Popover
                        id="popover-publication-actions"
                        placement="bottom"
                        trigger="click"
                        class="popover-leather w-fit z-10"
                        onmouseleave={() => (publicationActionsOpen = false)}
                      >
                        <div class="flex flex-row justify-between space-x-4">
                          <div class="flex flex-col text-nowrap">
                            <ul class="space-y-2">
                              <li>
                                <button
                                  class="btn-leather w-full text-left"
                                  onclick={() => {
                                    showArticleCommentUI = !showArticleCommentUI;
                                    publicationActionsOpen = false;
                                  }}
                                >
                                  <MessageDotsOutline class="inline mr-2" />
                                  {showArticleCommentUI ? "Close Comment" : "Comment On Article"}
                                </button>
                              </li>
                              <li>
                                <button
                                  class="btn-leather w-full text-left"
                                  onclick={() => {
                                    highlightModeActive = !highlightModeActive;
                                    publicationActionsOpen = false;
                                  }}
                                >
                                  <FilePenOutline class="inline mr-2" />
                                  {highlightModeActive ? "Exit Highlight Mode" : "Add Highlight"}
                                </button>
                              </li>
                              <li>
                                <button
                                  class="btn-leather w-full text-left"
                                  onclick={() => {
                                    toggleComments();
                                    publicationActionsOpen = false;
                                  }}
                                >
                                  {#if commentsVisible}
                                    <EyeSlashOutline class="inline mr-2" />
                                    Hide Comments
                                  {:else}
                                    <EyeOutline class="inline mr-2" />
                                    Show Comments
                                  {/if}
                                </button>
                              </li>
                              <li>
                                <button
                                  class="btn-leather w-full text-left"
                                  onclick={() => {
                                    toggleHighlights();
                                    publicationActionsOpen = false;
                                  }}
                                >
                                  {#if highlightsVisible}
                                    <EyeSlashOutline class="inline mr-2" />
                                    Hide Highlights
                                  {:else}
                                    <EyeOutline class="inline mr-2" />
                                    Show Highlights
                                  {/if}
                                </button>
                              </li>
                              <li>
                                <button
                                  class="btn-leather w-full text-left"
                                  onclick={viewDetails}
                                >
                                  <EyeOutline class="inline mr-2" /> View details
                                </button>
                              </li>
                              <li>
                                <CopyToClipboard
                                  displayText="Copy naddr address"
                                  copyText={naddrEncode(indexEvent, $activeOutboxRelays)}
                                  icon={ClipboardCleanOutline}
                                />
                              </li>
                              <li>
                                <CopyToClipboard
                                  displayText="Copy nevent address"
                                  copyText={neventEncode(indexEvent, $activeOutboxRelays)}
                                  icon={ClipboardCleanOutline}
                                />
                              </li>
                              {#if $userStore.signedIn && $userStore.pubkey === indexEvent.pubkey}
                                <li>
                                  <button
                                    class="btn-leather w-full text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                                    onclick={() => {
                                      publicationActionsOpen = false;
                                      handleDeletePublication();
                                    }}
                                  >
                                    <TrashBinOutline class="inline mr-2" />
                                    Delete publication
                                  </button>
                                </li>
                              {/if}
                            </ul>
                          </div>
                        </div>
                      </Popover>
                    {/if}
                  </div>
                </div>
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

          <!-- AI-NOTE: Top sentinel for bidirectional infinite scroll -->
          <!-- Triggers loading of sections before when scrolling up -->
          <div
            id="publication-top-sentinel"
            bind:this={topSentinelRef}
            class="flex justify-center items-center my-8 min-h-[100px] w-full"
            data-sentinel="top"
          >
            {#if isLoading && leaves.length > 0}
              <div class="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                <div class="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-primary-600"></div>
                <span>Loading previous sections...</span>
              </div>
            {/if}
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
              {@const publicationTitle = getMatchingTags(indexEvent, "title")[0]?.[1]}
              {@const isFirstSection = i === 0}
              <PublicationSection
                {rootAddress}
                {leaves}
                {address}
                {publicationTree}
                {toc}
                allComments={comments}
                {commentsVisible}
                publicationTitle={publicationTitle}
                {isFirstSection}
                ref={(el) => onPublicationSectionMounted(el, address)}
              />
            {/if}
          {/each}
          
          <!-- AI-NOTE: Sentinel element for intersection observer auto-loading -->
          <!-- Triggers automatic loading when user scrolls near the last rendered event -->
          <!-- Always render sentinel to ensure it's observable, even when done -->
          <div
            id="publication-sentinel"
            bind:this={sentinelRef}
            class="flex justify-center items-center my-8 min-h-[100px] w-full"
            data-sentinel="true"
          >
            {#if isDone}
              <p class="text-gray-500 dark:text-gray-400">
                You've reached the end of the publication.
              </p>
            {:else if isLoading}
              <div class="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                <div class="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-primary-600"></div>
                <span>Loading more...</span>
              </div>
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
      class="z-10 ml-4 fixed overflow-y-auto"
      style="top: {sidebarTop}px; height: calc(100vh - {sidebarTop + 3}px);"
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
    class="fixed left-0 w-fit min-w-[280px] max-w-[min(98vw,500px)] z-[110] dark:bg-primary-900 bg-primary-50 rounded-r-lg shadow-xl transition-transform duration-300 ease-in-out {$publicationColumnVisibility.toc
      ? 'translate-x-0'
      : '-translate-x-full'}"
    style="top: {sidebarTop}px; height: calc(100vh - {sidebarTop}px);"
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
          onSectionFocused={(address: string) => {
            // Jump to section instead of just setting bookmark
            jumpToSection(address);
          }}
          onLoadMore={() => {
            if (!isLoading && !isDone && publicationTree) {
              // AI-NOTE: TOC load more triggers auto-loading with standard batch size
              loadMore(AUTO_LOAD_BATCH_SIZE);
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

<!-- CardActions component to reuse its modal (button visually hidden but still functional) -->
<div style="position: fixed; left: -9999px; width: 1px; height: 1px; overflow: hidden;">
  <CardActions 
    event={indexEvent} 
    bind:detailsModalOpen={detailsModalOpen}
  />
</div>
