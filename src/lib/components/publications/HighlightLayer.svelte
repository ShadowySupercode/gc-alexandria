<script lang="ts">
  import { getNdkContext, activeInboxRelays, activeOutboxRelays } from "$lib/ndk";
  import { pubkeyToHue } from "$lib/utils/nostrUtils";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";
  import { NDKEvent as NDKEventClass } from "@nostr-dev-kit/ndk";
  import { communityRelays } from "$lib/consts";
  import { WebSocketPool } from "$lib/data_structures/websocket_pool";

  let {
    eventId,
    eventAddress,
    eventIds = [],
    eventAddresses = [],
    visible = $bindable(false),
  }: {
    eventId?: string;
    eventAddress?: string;
    eventIds?: string[];
    eventAddresses?: string[];
    visible?: boolean;
  } = $props();

  const ndk = getNdkContext();

  // State management
  let highlights: NDKEvent[] = $state([]);
  let loading = $state(false);
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
   * Fetch highlight events (kind 9802) for the current publication using NDK
   */
  async function fetchHighlights() {
    // Prevent concurrent fetches
    if (loading) {
      console.log("[HighlightLayer] Already loading, skipping fetch");
      return;
    }

    // Collect all event IDs and addresses
    const allEventIds = [...(eventId ? [eventId] : []), ...eventIds].filter(Boolean);
    const allAddresses = [...(eventAddress ? [eventAddress] : []), ...eventAddresses].filter(Boolean);

    if (allEventIds.length === 0 && allAddresses.length === 0) {
      console.warn("[HighlightLayer] No event IDs or addresses provided");
      return;
    }

    loading = true;
    highlights = [];

    console.log(`[HighlightLayer] Fetching highlights for:`, {
      eventIds: allEventIds,
      addresses: allAddresses
    });

    try {
      // Build filter for kind 9802 highlight events
      // IMPORTANT: Use only #a tags because filters are AND, not OR
      // If we include both #e and #a, relays will only return highlights that have BOTH
      const filter: any = {
        kinds: [9802],
        limit: 500,
      };

      // Prefer #a (addressable events) since they're more specific and persistent
      if (allAddresses.length > 0) {
        filter["#a"] = allAddresses;
      } else if (allEventIds.length > 0) {
        // Fallback to #e if no addresses available
        filter["#e"] = allEventIds;
      }

      console.log(`[HighlightLayer] Fetching with filter:`, JSON.stringify(filter, null, 2));

      // Build explicit relay set (same pattern as HighlightSelectionHandler and CommentButton)
      const relays = [
        ...communityRelays,
        ...$activeOutboxRelays,
        ...$activeInboxRelays,
      ];
      const uniqueRelays = Array.from(new Set(relays));
      console.log(`[HighlightLayer] Fetching from ${uniqueRelays.length} relays:`, uniqueRelays);

      /**
       * Use WebSocketPool with nostr-tools protocol instead of NDK
       *
       * Reasons for not using NDK:
       * 1. NDK subscriptions mysteriously returned 0 events even when websocat confirmed events existed
       * 2. Consistency - CommentButton and HighlightSelectionHandler both use WebSocketPool pattern
       * 3. Better debugging - direct access to WebSocket messages for troubleshooting
       * 4. Proven reliability - battle-tested in the codebase for similar use cases
       * 5. Performance control - explicit 5s timeout per relay, tunable as needed
       *
       * This matches the pattern in:
       * - src/lib/components/publications/CommentButton.svelte:156-220
       * - src/lib/components/publications/HighlightSelectionHandler.svelte:217-280
       */
      const subscriptionId = `highlights-${Date.now()}`;
      const receivedEventIds = new Set<string>();
      let eoseCount = 0;

      const fetchPromises = uniqueRelays.map(async (relayUrl) => {
        try {
          console.log(`[HighlightLayer] Connecting to ${relayUrl}`);
          const ws = await WebSocketPool.instance.acquire(relayUrl);

          return new Promise<void>((resolve) => {
            const messageHandler = (event: MessageEvent) => {
              try {
                const message = JSON.parse(event.data);

                // Log ALL messages from relay.nostr.band for debugging
                if (relayUrl.includes('relay.nostr.band')) {
                  console.log(`[HighlightLayer] RAW message from ${relayUrl}:`, message);
                }

                if (message[0] === "EVENT" && message[1] === subscriptionId) {
                  const rawEvent = message[2];
                  console.log(`[HighlightLayer] EVENT from ${relayUrl}:`, {
                    id: rawEvent.id,
                    kind: rawEvent.kind,
                    content: rawEvent.content.substring(0, 50),
                    tags: rawEvent.tags
                  });

                  // Avoid duplicates
                  if (!receivedEventIds.has(rawEvent.id)) {
                    receivedEventIds.add(rawEvent.id);

                    // Convert to NDKEvent
                    const ndkEvent = new NDKEventClass(ndk, rawEvent);
                    highlights = [...highlights, ndkEvent];
                    console.log(`[HighlightLayer] Added highlight, total now: ${highlights.length}`);
                  }
                } else if (message[0] === "EOSE" && message[1] === subscriptionId) {
                  eoseCount++;
                  console.log(`[HighlightLayer] EOSE from ${relayUrl} (${eoseCount}/${uniqueRelays.length})`);

                  // Close subscription
                  ws.send(JSON.stringify(["CLOSE", subscriptionId]));
                  ws.removeEventListener("message", messageHandler);
                  WebSocketPool.instance.release(ws);
                  resolve();
                } else if (message[0] === "NOTICE") {
                  console.warn(`[HighlightLayer] NOTICE from ${relayUrl}:`, message[1]);
                }
              } catch (err) {
                console.error(`[HighlightLayer] Error processing message from ${relayUrl}:`, err);
              }
            };

            ws.addEventListener("message", messageHandler);

            // Send REQ
            const req = ["REQ", subscriptionId, filter];
            if (relayUrl.includes('relay.nostr.band')) {
              console.log(`[HighlightLayer] Sending REQ to ${relayUrl}:`, JSON.stringify(req));
            } else {
              console.log(`[HighlightLayer] Sending REQ to ${relayUrl}`);
            }
            ws.send(JSON.stringify(req));

            // Timeout per relay (5 seconds)
            setTimeout(() => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(["CLOSE", subscriptionId]));
                ws.removeEventListener("message", messageHandler);
                WebSocketPool.instance.release(ws);
              }
              resolve();
            }, 5000);
          });
        } catch (err) {
          console.error(`[HighlightLayer] Error connecting to ${relayUrl}:`, err);
        }
      });

      // Wait for all relays to respond or timeout
      await Promise.all(fetchPromises);

      console.log(`[HighlightLayer] Fetched ${highlights.length} highlights`);

      if (highlights.length > 0) {
        console.log(`[HighlightLayer] Highlights summary:`, highlights.map(h => ({
          content: h.content.substring(0, 30) + "...",
          address: h.tags.find(t => t[0] === "a")?.[1],
          author: h.pubkey.substring(0, 8)
        })));
      }

      loading = false;

      // Rendering is handled by the visibility/highlights effect

    } catch (err) {
      console.error(`[HighlightLayer] Error fetching highlights:`, err);
      loading = false;
    }
  }

  /**
   * Find text in the DOM and highlight it
   * @param text - The text to highlight
   * @param color - The color to use for highlighting
   * @param targetAddress - Optional address to limit search to specific section
   */
  function findAndHighlightText(text: string, color: string, targetAddress?: string): void {
    if (!containerRef || !text || text.trim().length === 0) {
      console.log(`[HighlightLayer] Cannot highlight - containerRef: ${!!containerRef}, text: "${text}"`);
      return;
    }

    // If we have a target address, search only in that section
    let searchRoot: HTMLElement | Document = containerRef;
    if (targetAddress) {
      const sectionElement = document.getElementById(targetAddress);
      if (sectionElement) {
        searchRoot = sectionElement;
        console.log(`[HighlightLayer] Searching in specific section: ${targetAddress}`);
      } else {
        console.log(`[HighlightLayer] Section ${targetAddress} not found in DOM, searching globally`);
      }
    }

    console.log(`[HighlightLayer] Searching for text: "${text}" in`, searchRoot);

    // Use TreeWalker to find all text nodes
    const walker = document.createTreeWalker(
      searchRoot,
      NodeFilter.SHOW_TEXT,
      null
    );

    const textNodes: Node[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      textNodes.push(node);
    }

    // Search for the highlight text in text nodes
    console.log(`[HighlightLayer] Searching through ${textNodes.length} text nodes`);

    for (const textNode of textNodes) {
      const nodeText = textNode.textContent || "";
      const index = nodeText.toLowerCase().indexOf(text.toLowerCase());

      if (index !== -1) {
        console.log(`[HighlightLayer] Found match in text node:`, nodeText.substring(Math.max(0, index - 20), Math.min(nodeText.length, index + text.length + 20)));
        const parent = textNode.parentNode;
        if (!parent) continue;

        // Skip if already highlighted
        if (parent.nodeName === "MARK" || (parent instanceof Element && parent.classList?.contains("highlight"))) {
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
        return; // Only highlight first occurrence to avoid multiple highlights
      }
    }

    console.log(`[HighlightLayer] No match found for text: "${text}"`);
  }

  /**
   * Render all highlights on the page
   */
  function renderHighlights() {
    console.log(`[HighlightLayer] renderHighlights called - visible: ${visible}, containerRef: ${!!containerRef}, highlights: ${highlights.length}`);

    if (!visible || !containerRef) {
      console.log(`[HighlightLayer] Skipping render - visible: ${visible}, containerRef: ${!!containerRef}`);
      return;
    }

    if (highlights.length === 0) {
      console.log(`[HighlightLayer] No highlights to render`);
      return;
    }

    // Clear existing highlights
    clearHighlights();

    console.log(`[HighlightLayer] Rendering ${highlights.length} highlights`);
    console.log(`[HighlightLayer] Container element:`, containerRef);
    console.log(`[HighlightLayer] Container has children:`, containerRef.children.length);

    // Apply each highlight
    for (const highlight of highlights) {
      const content = highlight.content;
      const color = colorMap.get(highlight.pubkey) || "hsla(60, 70%, 60%, 0.3)";

      // Extract the target address from the highlight's "a" tag
      const aTag = highlight.tags.find(tag => tag[0] === "a");
      const targetAddress = aTag ? aTag[1] : undefined;

      console.log(`[HighlightLayer] Rendering highlight:`, {
        content: content.substring(0, 50),
        contentLength: content.length,
        targetAddress,
        color,
        allTags: highlight.tags
      });

      if (content && content.trim().length > 0) {
        findAndHighlightText(content, color, targetAddress);
      } else {
        console.log(`[HighlightLayer] Skipping highlight - empty content`);
      }
    }

    // Check if any highlights were actually rendered
    const renderedHighlights = containerRef.querySelectorAll("mark.highlight");
    console.log(`[HighlightLayer] Rendered ${renderedHighlights.length} highlight marks in DOM`);
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

  // Track the last fetched event count to know when to refetch
  let lastFetchedCount = $state(0);
  let fetchTimeout: ReturnType<typeof setTimeout> | null = null;

  // Watch for changes to event data - debounce and fetch when data stabilizes
  $effect(() => {
    const currentCount = eventIds.length + eventAddresses.length;
    const hasEventData = currentCount > 0;

    console.log(`[HighlightLayer] Event data effect - count: ${currentCount}, lastFetched: ${lastFetchedCount}, loading: ${loading}`);

    // Only fetch if:
    // 1. We have event data
    // 2. The count has changed since last fetch
    // 3. We're not already loading
    if (hasEventData && currentCount !== lastFetchedCount && !loading) {
      // Clear any existing timeout
      if (fetchTimeout) {
        clearTimeout(fetchTimeout);
      }

      // Debounce: wait 500ms for more events to arrive before fetching
      fetchTimeout = setTimeout(() => {
        console.log(`[HighlightLayer] Event data stabilized at ${currentCount} events, fetching highlights...`);
        lastFetchedCount = currentCount;
        fetchHighlights();
      }, 500);
    }

    // Cleanup timeout on effect cleanup
    return () => {
      if (fetchTimeout) {
        clearTimeout(fetchTimeout);
      }
    };
  });

  // Watch for visibility AND highlights changes - render when both are ready
  $effect(() => {
    // This effect runs when either visible or highlights.length changes
    const highlightCount = highlights.length;
    console.log(`[HighlightLayer] Visibility/highlights effect - visible: ${visible}, highlights: ${highlightCount}`);

    if (visible && highlightCount > 0) {
      console.log(`[HighlightLayer] Both visible and highlights ready, rendering...`);
      renderHighlights();
    } else if (!visible) {
      clearHighlights();
    }
  });

  /**
   * Bind to parent container element
   */
  export function setContainer(element: HTMLElement | null) {
    containerRef = element;
  }

  /**
   * Public method to refresh highlights (e.g., after creating a new one)
   */
  export function refresh() {
    console.log("[HighlightLayer] Manual refresh triggered");

    // Clear existing highlights
    highlights = [];
    clearHighlights();

    // Reset fetch count to force re-fetch
    lastFetchedCount = 0;
    fetchHighlights();
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
