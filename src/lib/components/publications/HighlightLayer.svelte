<script lang="ts">
  import { onMount } from "svelte";
  import { getNdkContext } from "$lib/ndk";
  import { pubkeyToHue } from "$lib/utils/nostrUtils";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";

  let {
    eventId,
    eventAddress,
    visible = $bindable(false),
  }: {
    eventId?: string;
    eventAddress?: string;
    visible?: boolean;
  } = $props();

  const ndk = getNdkContext();

  // State management
  let highlights: NDKEvent[] = $state([]);
  let loading = $state(false);
  let activeSub: any = null;
  let containerRef: HTMLElement | null = $state(null);

  // Derived state for color mapping
  let colorMap = $derived.by(() => {
    const map = new Map<string, string>();
    highlights.forEach(highlight => {
      if (!map.has(highlight.pubkey)) {
        const hue = pubkeyToHue(highlight.pubkey);
        map.set(highlight.pubkey, `hsla(${hue}, 70%, 60%, 0.3)`);
      }
    });
    return map;
  });

  /**
   * Fetch highlight events (kind 9802) for the current publication
   */
  async function fetchHighlights() {
    if (!eventId && !eventAddress) {
      console.warn("[HighlightLayer] No event ID or address provided");
      return;
    }

    loading = true;
    highlights = [];

    console.log(`[HighlightLayer] Fetching highlights for:`, { eventId, eventAddress });

    try {
      // Build filter for kind 9802 highlight events
      const filter: any = {
        kinds: [9802],
        limit: 100,
      };

      // Add event ID filter if available
      if (eventId) {
        filter["#e"] = [eventId];
      }

      // Add address filter if available
      if (eventAddress) {
        if (!filter["#a"]) {
          filter["#a"] = [];
        }
        filter["#a"].push(eventAddress);
      }

      console.log(`[HighlightLayer] Filter:`, filter);

      // Subscribe to highlight events
      activeSub = ndk.subscribe(filter);

      const timeout = setTimeout(() => {
        console.log(`[HighlightLayer] Subscription timeout`);
        if (activeSub) {
          activeSub.stop();
          activeSub = null;
        }
        loading = false;
      }, 10000);

      activeSub.on("event", (highlightEvent: NDKEvent) => {
        console.log(`[HighlightLayer] Received highlight:`, highlightEvent.id);
        console.log(`[HighlightLayer] Highlight content:`, highlightEvent.content);

        // Add to highlights array if not already present
        if (!highlights.some(h => h.id === highlightEvent.id)) {
          highlights = [...highlights, highlightEvent];
        }
      });

      activeSub.on("eose", () => {
        console.log(`[HighlightLayer] EOSE received, found ${highlights.length} highlights`);
        clearTimeout(timeout);
        if (activeSub) {
          activeSub.stop();
          activeSub = null;
        }
        loading = false;

        // Render highlights after fetching
        if (visible) {
          renderHighlights();
        }
      });

      activeSub.on("error", (err: any) => {
        console.error(`[HighlightLayer] Subscription error:`, err);
        clearTimeout(timeout);
        if (activeSub) {
          activeSub.stop();
          activeSub = null;
        }
        loading = false;
      });

    } catch (err) {
      console.error(`[HighlightLayer] Error fetching highlights:`, err);
      loading = false;
    }
  }

  /**
   * Find text in the DOM and highlight it
   */
  function findAndHighlightText(text: string, color: string): void {
    if (!containerRef || !text || text.trim().length === 0) return;

    // Use TreeWalker to find all text nodes
    const walker = document.createTreeWalker(
      containerRef,
      NodeFilter.SHOW_TEXT,
      null
    );

    const textNodes: Node[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      textNodes.push(node);
    }

    // Search for the highlight text in text nodes
    for (const textNode of textNodes) {
      const nodeText = textNode.textContent || "";
      const index = nodeText.toLowerCase().indexOf(text.toLowerCase());

      if (index !== -1) {
        const parent = textNode.parentNode;
        if (!parent) continue;

        // Skip if already highlighted
        if (parent.nodeName === "MARK" || parent.classList?.contains("highlight")) {
          continue;
        }

        const before = nodeText.substring(0, index);
        const match = nodeText.substring(index, index + text.length);
        const after = nodeText.substring(index + text.length);

        // Create highlight span
        const highlightSpan = document.createElement("mark");
        highlightSpan.className = "highlight";
        highlightSpan.style.backgroundColor = color;
        highlightSpan.style.borderRadius = "2px";
        highlightSpan.style.padding = "2px 0";
        highlightSpan.textContent = match;

        // Replace the text node with the highlighted version
        const fragment = document.createDocumentFragment();
        if (before) fragment.appendChild(document.createTextNode(before));
        fragment.appendChild(highlightSpan);
        if (after) fragment.appendChild(document.createTextNode(after));

        parent.replaceChild(fragment, textNode);

        console.log(`[HighlightLayer] Highlighted text:`, match);
        break; // Only highlight first occurrence to avoid multiple highlights
      }
    }
  }

  /**
   * Render all highlights on the page
   */
  function renderHighlights() {
    if (!visible || !containerRef) return;

    // Clear existing highlights
    clearHighlights();

    console.log(`[HighlightLayer] Rendering ${highlights.length} highlights`);

    // Apply each highlight
    for (const highlight of highlights) {
      const content = highlight.content;
      const color = colorMap.get(highlight.pubkey) || "hsla(60, 70%, 60%, 0.3)";

      if (content && content.trim().length > 0) {
        findAndHighlightText(content, color);
      }
    }
  }

  /**
   * Clear all highlights from the page
   */
  function clearHighlights() {
    if (!containerRef) return;

    const highlightElements = containerRef.querySelectorAll("mark.highlight");
    highlightElements.forEach(el => {
      const parent = el.parentNode;
      if (parent) {
        // Replace highlight with plain text
        const textNode = document.createTextNode(el.textContent || "");
        parent.replaceChild(textNode, el);

        // Normalize the parent to merge adjacent text nodes
        parent.normalize();
      }
    });

    console.log(`[HighlightLayer] Cleared ${highlightElements.length} highlights`);
  }

  // Fetch highlights on mount
  onMount(() => {
    fetchHighlights();

    return () => {
      if (activeSub) {
        activeSub.stop();
        activeSub = null;
      }
    };
  });

  // Watch for visibility changes
  $effect(() => {
    if (visible) {
      renderHighlights();
    } else {
      clearHighlights();
    }
  });

  // Watch for changes to eventId or eventAddress
  $effect(() => {
    if (eventId || eventAddress) {
      // Cleanup previous subscription
      if (activeSub) {
        activeSub.stop();
        activeSub = null;
      }

      // Clear existing highlights
      highlights = [];
      clearHighlights();

      // Fetch new highlights
      fetchHighlights();
    }
  });

  /**
   * Bind to parent container element
   */
  export function setContainer(element: HTMLElement | null) {
    containerRef = element;
  }
</script>

{#if loading && visible}
  <div class="fixed top-4 right-4 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-3">
    <p class="text-sm text-gray-600 dark:text-gray-300">Loading highlights...</p>
  </div>
{/if}

{#if visible && highlights.length > 0}
  <div class="fixed bottom-4 right-4 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-3 max-w-xs">
    <h4 class="text-sm font-semibold mb-2 text-gray-900 dark:text-gray-100">
      Highlights ({highlights.length})
    </h4>
    <div class="space-y-1">
      {#each Array.from(colorMap.entries()) as [pubkey, color]}
        <div class="flex items-center gap-2 text-xs">
          <div
            class="w-4 h-4 rounded"
            style="background-color: {color};"
          ></div>
          <span class="text-gray-600 dark:text-gray-300 truncate">
            {pubkey.slice(0, 8)}...
          </span>
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  :global(mark.highlight) {
    transition: background-color 0.2s ease;
  }

  :global(mark.highlight:hover) {
    filter: brightness(1.1);
  }
</style>
