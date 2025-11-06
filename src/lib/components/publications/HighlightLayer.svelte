<script lang="ts">
  import { onMount } from "svelte";
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
   * Hardcoded test highlight event
   */
  const HARDCODED_HIGHLIGHT = {
    "content": "This is another paragraph.",
    "created_at": 1762391061,
    "id": "6b19da244c54f27ef8b70ecc8246bef43d3b981075842fd341e9bbb98f5a790d",
    "kind": 9802,
    "pubkey": "dc4cd086cd7ce5b1832adf4fdd1211289880d2c7e295bcb0e684c01acee77c06",
    "sig": "3635bc09a077d434280e5aaadf2e017e02b3fc5e198a9bedab2a16477a7761cce7b2e1f139bd2226fc14526c4f819ea9499b5c6f0f0cb23f068cebc96db59514",
    "tags": [
      ["a", "30041:fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1:first-level-heading", ""],
      ["context", "This is another paragraph.[1]"],
      ["p", "fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1", "", "author"]
    ]
  };

  /**
   * Fetch highlight events (kind 9802) for the current publication using direct WebSocket connections
   */
  async function fetchHighlights() {
    // TEMPORARY: Use hardcoded highlight to test rendering
    console.log("[HighlightLayer] Using hardcoded highlight for testing");
    loading = true;
    highlights = [];

    try {
      // Convert hardcoded event to NDKEvent
      const ndkEvent = new NDKEventClass(ndk, HARDCODED_HIGHLIGHT);
      highlights = [ndkEvent];

      console.log(`[HighlightLayer] Loaded hardcoded highlight:`, {
        content: ndkEvent.content,
        address: ndkEvent.tags.find(t => t[0] === "a")?.[1],
        author: ndkEvent.pubkey.substring(0, 8)
      });

      loading = false;

      // Render highlights after fetching
      if (visible) {
        renderHighlights();
      }
    } catch (err) {
      console.error(`[HighlightLayer] Error with hardcoded highlight:`, err);
      loading = false;
    }

    /* ORIGINAL WEBSOCKET CODE - COMMENTED OUT FOR TESTING
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
      const filter: any = {
        kinds: [9802],
        limit: 500,
      };

      // Add all event IDs to filter
      if (allEventIds.length > 0) {
        filter["#e"] = allEventIds;
      }

      // Add all addresses to filter
      if (allAddresses.length > 0) {
        filter["#a"] = allAddresses;
      }

      console.log(`[HighlightLayer] Filter:`, JSON.stringify(filter, null, 2));

      // Build relay list
      const relays = [
        ...communityRelays,
        ...$activeInboxRelays,
        ...$activeOutboxRelays,
      ];
      const uniqueRelays = Array.from(new Set(relays));

      console.log(`[HighlightLayer] Fetching from ${uniqueRelays.length} relays:`, uniqueRelays);

      // Fetch from each relay using WebSocketPool
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

                if (message[0] === "EVENT" && message[1] === subscriptionId) {
                  const rawEvent = message[2];
                  console.log(`[HighlightLayer] Received event from ${relayUrl}:`, rawEvent.id);

                  // Avoid duplicates
                  if (!receivedEventIds.has(rawEvent.id)) {
                    receivedEventIds.add(rawEvent.id);

                    // Convert to NDKEvent
                    const ndkEvent = new NDKEventClass(ndk, rawEvent);
                    highlights = [...highlights, ndkEvent];
                    console.log(`[HighlightLayer] Added highlight, total now: ${highlights.length}`);
                  }
                } else if (message[0] === "EOSE" && message[1] === subscriptionId) {
                  console.log(`[HighlightLayer] EOSE from ${relayUrl}`);
                  eoseCount++;

                  // Close subscription
                  ws.send(JSON.stringify(["CLOSE", subscriptionId]));
                  ws.removeEventListener("message", messageHandler);
                  WebSocketPool.instance.release(ws);
                  resolve();
                }
              } catch (err) {
                console.error(`[HighlightLayer] Error processing message from ${relayUrl}:`, err);
              }
            };

            ws.addEventListener("message", messageHandler);

            // Send REQ
            const req = ["REQ", subscriptionId, filter];
            console.log(`[HighlightLayer] Sending to ${relayUrl}:`, JSON.stringify(req));
            ws.send(JSON.stringify(req));

            // Timeout per relay
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

      console.log(`[HighlightLayer] Fetch complete. Found ${highlights.length} unique highlights from ${eoseCount} relays`);

      if (highlights.length > 0) {
        console.log(`[HighlightLayer] Highlights summary:`, highlights.map(h => ({
          content: h.content.substring(0, 30) + "...",
          address: h.tags.find(t => t[0] === "a")?.[1],
          author: h.pubkey.substring(0, 8)
        })));
      }

      loading = false;

      // Render highlights after fetching
      if (visible) {
        renderHighlights();
      }

    } catch (err) {
      console.error(`[HighlightLayer] Error fetching highlights:`, err);
      loading = false;
    }
    */
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
    console.log(`[HighlightLayer] renderHighlights called - visible: ${visible}, containerRef: ${!!containerRef}`);

    if (!visible || !containerRef) {
      console.log(`[HighlightLayer] Skipping render - visible: ${visible}, containerRef: ${!!containerRef}`);
      return;
    }

    // Clear existing highlights
    clearHighlights();

    console.log(`[HighlightLayer] Rendering ${highlights.length} highlights`);
    console.log(`[HighlightLayer] Container element:`, containerRef);

    // Apply each highlight
    for (const highlight of highlights) {
      const content = highlight.content;
      const color = colorMap.get(highlight.pubkey) || "hsla(60, 70%, 60%, 0.3)";

      // Extract the target address from the highlight's "a" tag
      const aTag = highlight.tags.find(tag => tag[0] === "a");
      const targetAddress = aTag ? aTag[1] : undefined;

      console.log(`[HighlightLayer] Rendering highlight:`, {
        content: content,
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

  // TEMPORARILY DISABLED - TESTING ONLY
  // Fetch highlights on mount
  // onMount(() => {
  //   fetchHighlights();
  // });

  // Watch for visibility changes - ONLY render/clear, don't fetch
  $effect(() => {
    console.log(`[HighlightLayer] Visibility changed to: ${visible}`);
    if (visible) {
      // Only fetch if we don't have highlights yet
      if (highlights.length === 0) {
        console.log(`[HighlightLayer] No highlights loaded, fetching...`);
        fetchHighlights();
      } else {
        console.log(`[HighlightLayer] Already have ${highlights.length} highlights, just rendering`);
        renderHighlights();
      }
    } else {
      clearHighlights();
    }
  });

  // TEMPORARILY DISABLED - TESTING ONLY
  // Watch for changes to eventId, eventAddress, eventIds, or eventAddresses
  // $effect(() => {
  //   if (eventId || eventAddress || eventIds.length > 0 || eventAddresses.length > 0) {
  //     // Clear existing highlights
  //     highlights = [];
  //     clearHighlights();

  //     // Fetch new highlights
  //     fetchHighlights();
  //   }
  // });

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

    // Fetch new highlights
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
