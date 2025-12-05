<script lang="ts">
  import {
    getNdkContext,
    activeInboxRelays,
    activeOutboxRelays,
  } from "$lib/ndk";
  import { pubkeyToHue } from "$lib/utils/nostrUtils";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";
  import { NDKEvent as NDKEventClass } from "@nostr-dev-kit/ndk";
  import { communityRelays } from "$lib/consts";
  import { WebSocketPool } from "$lib/data_structures/websocket_pool";
  import { generateMockHighlightsForSections } from "$lib/utils/mockHighlightData";
  import {
    groupHighlightsByAuthor,
    truncateHighlight,
    encodeHighlightNaddr,
    getRelaysFromHighlight,
    getAuthorDisplayName,
    sortHighlightsByTime,
  } from "$lib/utils/highlightUtils";
  import { unifiedProfileCache } from "$lib/utils/npubCache";
  import { nip19 } from "nostr-tools";
  import {
    highlightByOffset,
    getPlainText,
  } from "$lib/utils/highlightPositioning";

  let {
    eventId,
    eventAddress,
    eventIds = [],
    eventAddresses = [],
    visible = $bindable(false),
    useMockHighlights = false,
  }: {
    eventId?: string;
    eventAddress?: string;
    eventIds?: string[];
    eventAddresses?: string[];
    visible?: boolean;
    useMockHighlights?: boolean;
  } = $props();

  const ndk = getNdkContext();

  // State management
  let highlights: NDKEvent[] = $state([]);
  let loading = $state(false);
  let containerRef: HTMLElement | null = $state(null);
  let expandedAuthors = $state(new Set<string>());
  let authorProfiles = $state(new Map<string, any>());
  let copyFeedback = $state<string | null>(null);

  // Derived state for color mapping
  let colorMap = $derived.by(() => {
    const map = new Map<string, string>();
    highlights.forEach((highlight) => {
      if (!map.has(highlight.pubkey)) {
        const hue = pubkeyToHue(highlight.pubkey);
        map.set(highlight.pubkey, `hsla(${hue}, 70%, 60%, 0.3)`);
      }
    });
    return map;
  });

  // Derived state for grouped highlights
  let groupedHighlights = $derived.by(() => {
    return groupHighlightsByAuthor(highlights);
  });

  /**
   * Fetch highlight events (kind 9802) for the current publication using NDK
   * Or generate mock highlights if useMockHighlights is enabled
   */
  async function fetchHighlights() {
    // Prevent concurrent fetches
    if (loading) {
      console.log("[HighlightLayer] Already loading, skipping fetch");
      return;
    }

    // Collect all event IDs and addresses
    const allEventIds = [...(eventId ? [eventId] : []), ...eventIds].filter(
      Boolean,
    );
    const allAddresses = [
      ...(eventAddress ? [eventAddress] : []),
      ...eventAddresses,
    ].filter(Boolean);

    if (allEventIds.length === 0 && allAddresses.length === 0) {
      console.warn("[HighlightLayer] No event IDs or addresses provided");
      return;
    }

    loading = true;
    highlights = [];

    // AI-NOTE: Mock mode allows testing highlight UI without publishing to relays
    // This is useful for development and demonstrating the highlight system
    if (useMockHighlights) {
      console.log(
        `[HighlightLayer] MOCK MODE - Generating mock highlights for ${allAddresses.length} sections`,
      );

      try {
        // Generate mock highlight data
        const mockHighlights = generateMockHighlightsForSections(allAddresses);

        // Convert to NDKEvent instances (same as real events)
        highlights = mockHighlights.map(
          (rawEvent) => new NDKEventClass(ndk, rawEvent),
        );

        console.log(
          `[HighlightLayer] Generated ${highlights.length} mock highlights`,
        );
        loading = false;
        return;
      } catch (err) {
        console.error(
          `[HighlightLayer] Error generating mock highlights:`,
          err,
        );
        loading = false;
        return;
      }
    }

    console.log(`[HighlightLayer] Fetching highlights for:`, {
      eventIds: allEventIds,
      addresses: allAddresses,
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

      console.log(
        `[HighlightLayer] Fetching with filter:`,
        JSON.stringify(filter, null, 2),
      );

      // Build explicit relay set (same pattern as HighlightSelectionHandler and CommentButton)
      const relays = [
        ...communityRelays,
        ...$activeOutboxRelays,
        ...$activeInboxRelays,
      ];
      const uniqueRelays = Array.from(new Set(relays));
      console.log(
        `[HighlightLayer] Fetching from ${uniqueRelays.length} relays:`,
        uniqueRelays,
      );

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
                if (relayUrl.includes("relay.nostr.band")) {
                  console.log(
                    `[HighlightLayer] RAW message from ${relayUrl}:`,
                    message,
                  );
                }

                if (message[0] === "EVENT" && message[1] === subscriptionId) {
                  const rawEvent = message[2];
                  console.log(`[HighlightLayer] EVENT from ${relayUrl}:`, {
                    id: rawEvent.id,
                    kind: rawEvent.kind,
                    content: rawEvent.content.substring(0, 50),
                    tags: rawEvent.tags,
                  });

                  // Avoid duplicates
                  if (!receivedEventIds.has(rawEvent.id)) {
                    receivedEventIds.add(rawEvent.id);

                    // Convert to NDKEvent
                    const ndkEvent = new NDKEventClass(ndk, rawEvent);
                    highlights = [...highlights, ndkEvent];
                    console.log(
                      `[HighlightLayer] Added highlight, total now: ${highlights.length}`,
                    );
                  }
                } else if (
                  message[0] === "EOSE" &&
                  message[1] === subscriptionId
                ) {
                  eoseCount++;
                  console.log(
                    `[HighlightLayer] EOSE from ${relayUrl} (${eoseCount}/${uniqueRelays.length})`,
                  );

                  // Close subscription
                  ws.send(JSON.stringify(["CLOSE", subscriptionId]));
                  ws.removeEventListener("message", messageHandler);
                  WebSocketPool.instance.release(ws);
                  resolve();
                } else if (message[0] === "NOTICE") {
                  console.warn(
                    `[HighlightLayer] NOTICE from ${relayUrl}:`,
                    message[1],
                  );
                }
              } catch (err) {
                console.error(
                  `[HighlightLayer] Error processing message from ${relayUrl}:`,
                  err,
                );
              }
            };

            ws.addEventListener("message", messageHandler);

            // Send REQ
            const req = ["REQ", subscriptionId, filter];
            if (relayUrl.includes("relay.nostr.band")) {
              console.log(
                `[HighlightLayer] Sending REQ to ${relayUrl}:`,
                JSON.stringify(req),
              );
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
          console.error(
            `[HighlightLayer] Error connecting to ${relayUrl}:`,
            err,
          );
        }
      });

      // Wait for all relays to respond or timeout
      await Promise.all(fetchPromises);

      console.log(`[HighlightLayer] Fetched ${highlights.length} highlights`);

      if (highlights.length > 0) {
        console.log(
          `[HighlightLayer] Highlights summary:`,
          highlights.map((h) => ({
            content: h.content.substring(0, 30) + "...",
            address: h.tags.find((t) => t[0] === "a")?.[1],
            author: h.pubkey.substring(0, 8),
          })),
        );
      }

      loading = false;

      // Rendering is handled by the visibility/highlights effect
    } catch (err) {
      console.error(`[HighlightLayer] Error fetching highlights:`, err);
      loading = false;
    }
  }

  /**
   * Apply highlight using position offsets
   * @param offsetStart - Start character position
   * @param offsetEnd - End character position
   * @param color - The color to use for highlighting
   * @param targetAddress - Optional address to limit search to specific section
   */
  function highlightByPosition(
    offsetStart: number,
    offsetEnd: number,
    color: string,
    targetAddress?: string,
  ): boolean {
    if (!containerRef) {
      console.log(
        `[HighlightLayer] Cannot highlight by position - no containerRef`,
      );
      return false;
    }

    // If we have a target address, search only in that section
    let searchRoot: HTMLElement = containerRef;
    if (targetAddress) {
      const sectionElement = document.getElementById(targetAddress);
      if (sectionElement) {
        searchRoot = sectionElement;
        console.log(
          `[HighlightLayer] Highlighting in specific section: ${targetAddress}`,
        );
      } else {
        console.log(
          `[HighlightLayer] Section ${targetAddress} not found in DOM, searching globally`,
        );
      }
    }

    console.log(
      `[HighlightLayer] Applying position-based highlight ${offsetStart}-${offsetEnd}`,
    );
    const result = highlightByOffset(searchRoot, offsetStart, offsetEnd, color);

    if (result) {
      console.log(
        `[HighlightLayer] Successfully applied position-based highlight`,
      );
    } else {
      console.log(`[HighlightLayer] Failed to apply position-based highlight`);
    }

    return result;
  }

  /**
   * Find text in the DOM and highlight it (fallback method)
   * @param text - The text to highlight
   * @param color - The color to use for highlighting
   * @param targetAddress - Optional address to limit search to specific section
   */
  function findAndHighlightText(
    text: string,
    color: string,
    targetAddress?: string,
  ): void {
    if (!containerRef || !text || text.trim().length === 0) {
      console.log(
        `[HighlightLayer] Cannot highlight - containerRef: ${!!containerRef}, text: "${text}"`,
      );
      return;
    }

    // If we have a target address, search only in that section
    let searchRoot: HTMLElement | Document = containerRef;
    if (targetAddress) {
      const sectionElement = document.getElementById(targetAddress);
      if (sectionElement) {
        searchRoot = sectionElement;
        console.log(
          `[HighlightLayer] Searching in specific section: ${targetAddress}`,
        );
      } else {
        console.log(
          `[HighlightLayer] Section ${targetAddress} not found in DOM, searching globally`,
        );
      }
    }

    console.log(
      `[HighlightLayer] Searching for text: "${text}" in`,
      searchRoot,
    );

    // Use TreeWalker to find all text nodes
    const walker = document.createTreeWalker(
      searchRoot,
      NodeFilter.SHOW_TEXT,
      null,
    );

    const textNodes: Node[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      textNodes.push(node);
    }

    // Search for the highlight text in text nodes
    console.log(
      `[HighlightLayer] Searching through ${textNodes.length} text nodes`,
    );

    for (const textNode of textNodes) {
      const nodeText = textNode.textContent || "";
      const index = nodeText.toLowerCase().indexOf(text.toLowerCase());

      if (index !== -1) {
        console.log(
          `[HighlightLayer] Found match in text node:`,
          nodeText.substring(
            Math.max(0, index - 20),
            Math.min(nodeText.length, index + text.length + 20),
          ),
        );
        const parent = textNode.parentNode;
        if (!parent) continue;

        // Skip if already highlighted
        if (
          parent.nodeName === "MARK" ||
          (parent instanceof Element && parent.classList?.contains("highlight"))
        ) {
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
    console.log(
      `[HighlightLayer] renderHighlights called - visible: ${visible}, containerRef: ${!!containerRef}, highlights: ${highlights.length}`,
    );

    if (!visible || !containerRef) {
      console.log(
        `[HighlightLayer] Skipping render - visible: ${visible}, containerRef: ${!!containerRef}`,
      );
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
    console.log(
      `[HighlightLayer] Container has children:`,
      containerRef.children.length,
    );

    // Apply each highlight
    for (const highlight of highlights) {
      const content = highlight.content;
      const color = colorMap.get(highlight.pubkey) || "hsla(60, 70%, 60%, 0.3)";

      // Extract the target address from the highlight's "a" tag
      const aTag = highlight.tags.find((tag) => tag[0] === "a");
      const targetAddress = aTag ? aTag[1] : undefined;

      // Check for offset tags (position-based highlighting)
      const offsetTag = highlight.tags.find((tag) => tag[0] === "offset");
      const hasOffset =
        offsetTag && offsetTag[1] !== undefined && offsetTag[2] !== undefined;

      console.log(`[HighlightLayer] Rendering highlight:`, {
        hasOffset,
        offsetTag,
        content: content.substring(0, 50),
        contentLength: content.length,
        targetAddress,
        color,
        allTags: highlight.tags,
      });

      if (hasOffset) {
        // Use position-based highlighting
        const offsetStart = parseInt(offsetTag[1], 10);
        const offsetEnd = parseInt(offsetTag[2], 10);

        if (!isNaN(offsetStart) && !isNaN(offsetEnd)) {
          console.log(
            `[HighlightLayer] Using position-based highlighting: ${offsetStart}-${offsetEnd}`,
          );
          highlightByPosition(offsetStart, offsetEnd, color, targetAddress);
        } else {
          console.log(
            `[HighlightLayer] Invalid offset values, falling back to text search`,
          );
          if (content && content.trim().length > 0) {
            findAndHighlightText(content, color, targetAddress);
          }
        }
      } else {
        // Fall back to text-based highlighting
        console.log(`[HighlightLayer] Using text-based highlighting`);
        if (content && content.trim().length > 0) {
          findAndHighlightText(content, color, targetAddress);
        } else {
          console.log(`[HighlightLayer] Skipping highlight - empty content`);
        }
      }
    }

    // Check if any highlights were actually rendered
    const renderedHighlights = containerRef.querySelectorAll("mark.highlight");
    console.log(
      `[HighlightLayer] Rendered ${renderedHighlights.length} highlight marks in DOM`,
    );
  }

  /**
   * Clear all highlights from the page
   */
  function clearHighlights() {
    if (!containerRef) return;

    const highlightElements = containerRef.querySelectorAll("mark.highlight");
    highlightElements.forEach((el) => {
      const parent = el.parentNode;
      if (parent) {
        // Replace highlight with plain text
        const textNode = document.createTextNode(el.textContent || "");
        parent.replaceChild(textNode, el);

        // Normalize the parent to merge adjacent text nodes
        parent.normalize();
      }
    });

    console.log(
      `[HighlightLayer] Cleared ${highlightElements.length} highlights`,
    );
  }

  // Track the last fetched event count to know when to refetch
  let lastFetchedCount = $state(0);
  let fetchTimeout: ReturnType<typeof setTimeout> | null = null;

  // Watch for changes to event data - debounce and fetch when data stabilizes
  $effect(() => {
    const currentCount = eventIds.length + eventAddresses.length;
    const hasEventData = currentCount > 0;

    console.log(
      `[HighlightLayer] Event data effect - count: ${currentCount}, lastFetched: ${lastFetchedCount}, loading: ${loading}`,
    );

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
        console.log(
          `[HighlightLayer] Event data stabilized at ${currentCount} events, fetching highlights...`,
        );
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
    console.log(
      `[HighlightLayer] Visibility/highlights effect - visible: ${visible}, highlights: ${highlightCount}`,
    );

    if (visible && highlightCount > 0) {
      console.log(
        `[HighlightLayer] Both visible and highlights ready, rendering...`,
      );
      renderHighlights();
    } else if (!visible) {
      clearHighlights();
    }
  });

  // Fetch profiles when highlights change
  $effect(() => {
    const highlightCount = highlights.length;
    if (highlightCount > 0) {
      fetchAuthorProfiles();
    }
  });

  /**
   * Fetch author profiles for all unique pubkeys in highlights
   */
  async function fetchAuthorProfiles() {
    const uniquePubkeys = Array.from(groupedHighlights.keys());
    console.log(
      `[HighlightLayer] Fetching profiles for ${uniquePubkeys.length} authors`,
    );

    for (const pubkey of uniquePubkeys) {
      try {
        // Convert hex pubkey to npub for the profile cache
        const npub = nip19.npubEncode(pubkey);
        const profile = await unifiedProfileCache.getProfile(npub, ndk);
        if (profile) {
          authorProfiles.set(pubkey, profile);
          // Trigger reactivity
          authorProfiles = new Map(authorProfiles);
        }
      } catch (err) {
        console.error(
          `[HighlightLayer] Error fetching profile for ${pubkey}:`,
          err,
        );
      }
    }
  }

  /**
   * Toggle expansion state for an author's highlights
   */
  function toggleAuthor(pubkey: string) {
    if (expandedAuthors.has(pubkey)) {
      expandedAuthors.delete(pubkey);
    } else {
      expandedAuthors.add(pubkey);
    }
    // Trigger reactivity
    expandedAuthors = new Set(expandedAuthors);
  }

  /**
   * Scroll to a specific highlight in the document
   */
  function scrollToHighlight(highlight: NDKEvent) {
    console.log(
      `[HighlightLayer] scrollToHighlight called for:`,
      highlight.content.substring(0, 50),
    );

    if (!containerRef) {
      console.warn(`[HighlightLayer] No containerRef available`);
      return;
    }

    const content = highlight.content;
    if (!content || content.trim().length === 0) {
      console.warn(`[HighlightLayer] No content in highlight`);
      return;
    }

    // Find the highlight mark element
    const highlightMarks = containerRef.querySelectorAll("mark.highlight");
    console.log(
      `[HighlightLayer] Found ${highlightMarks.length} highlight marks in DOM`,
    );

    // Try exact match first
    for (const mark of highlightMarks) {
      const markText = mark.textContent?.toLowerCase() || "";
      const searchText = content.toLowerCase();

      if (markText === searchText) {
        console.log(
          `[HighlightLayer] Found exact match, scrolling and flashing`,
        );
        // Scroll to this element
        mark.scrollIntoView({ behavior: "smooth", block: "center" });

        // Add a temporary flash effect
        mark.classList.add("highlight-flash");
        setTimeout(() => {
          mark.classList.remove("highlight-flash");
        }, 1500);
        return;
      }
    }

    // Try partial match (for position-based highlights that might be split)
    for (const mark of highlightMarks) {
      const markText = mark.textContent?.toLowerCase() || "";
      const searchText = content.toLowerCase();

      if (markText.includes(searchText) || searchText.includes(markText)) {
        console.log(
          `[HighlightLayer] Found partial match, scrolling and flashing`,
        );
        mark.scrollIntoView({ behavior: "smooth", block: "center" });
        mark.classList.add("highlight-flash");
        setTimeout(() => {
          mark.classList.remove("highlight-flash");
        }, 1500);
        return;
      }
    }

    console.warn(
      `[HighlightLayer] Could not find highlight mark for:`,
      content.substring(0, 50),
    );
  }

  /**
   * Copy highlight naddr to clipboard
   */
  async function copyHighlightNaddr(highlight: NDKEvent) {
    const relays = getRelaysFromHighlight(highlight);
    const naddr = encodeHighlightNaddr(highlight, relays);

    try {
      await navigator.clipboard.writeText(naddr);
      copyFeedback = highlight.id;
      console.log(`[HighlightLayer] Copied naddr to clipboard:`, naddr);

      // Clear feedback after 2 seconds
      setTimeout(() => {
        copyFeedback = null;
      }, 2000);
    } catch (err) {
      console.error(`[HighlightLayer] Error copying to clipboard:`, err);
    }
  }

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
  <div
    class="fixed top-40 right-4 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-3"
  >
    <p class="text-sm text-gray-600 dark:text-gray-300">
      Loading highlights...
    </p>
  </div>
{/if}

{#if visible && highlights.length > 0}
  <div
    class="fixed bottom-4 right-4 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 max-w-sm w-80"
  >
    <h4 class="text-sm font-semibold mb-3 text-gray-900 dark:text-gray-100">
      Highlights
    </h4>
    <div class="space-y-2 max-h-96 overflow-y-auto">
      {#each Array.from(groupedHighlights.entries()) as [pubkey, authorHighlights]}
        {@const isExpanded = expandedAuthors.has(pubkey)}
        {@const profile = authorProfiles.get(pubkey)}
        {@const displayName = getAuthorDisplayName(profile, pubkey)}
        {@const color = colorMap.get(pubkey) || "hsla(60, 70%, 60%, 0.3)"}
        {@const sortedHighlights = sortHighlightsByTime(authorHighlights)}

        <div class="border-b border-gray-200 dark:border-gray-700 pb-2">
          <!-- Author header -->
          <button
            class="w-full flex items-center gap-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 p-2 rounded transition-colors"
            onclick={() => toggleAuthor(pubkey)}
          >
            <div
              class="w-3 h-3 rounded flex-shrink-0"
              style="background-color: {color};"
            ></div>
            <span
              class="font-medium text-gray-900 dark:text-gray-100 flex-1 text-left truncate"
            >
              {displayName}
            </span>
            <span class="text-xs text-gray-500 dark:text-gray-400">
              ({authorHighlights.length})
            </span>
            <svg
              class="w-4 h-4 text-gray-500 transition-transform {isExpanded
                ? 'rotate-90'
                : ''}"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>

          <!-- Expanded highlight list -->
          {#if isExpanded}
            <div class="mt-2 ml-5 space-y-2">
              {#each sortedHighlights as highlight}
                {@const truncated = useMockHighlights
                  ? "test data"
                  : truncateHighlight(highlight.content)}
                {@const showCopied = copyFeedback === highlight.id}

                <div class="flex items-start gap-2 group">
                  <button
                    class="flex-1 text-left text-xs text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                    onclick={() => scrollToHighlight(highlight)}
                    title={useMockHighlights
                      ? "Mock highlight"
                      : highlight.content}
                  >
                    {truncated}
                  </button>
                  <button
                    class="flex-shrink-0 p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded transition-colors"
                    onclick={() => copyHighlightNaddr(highlight)}
                    title="Copy naddr"
                  >
                    {#if showCopied}
                      <svg
                        class="w-3 h-3 text-green-500"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clip-rule="evenodd"
                        />
                      </svg>
                    {:else}
                      <svg
                        class="w-3 h-3 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                        />
                      </svg>
                    {/if}
                  </button>
                </div>
              {/each}
            </div>
          {/if}
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

  :global(mark.highlight.highlight-flash) {
    animation: flash 1.5s ease-in-out;
  }

  @keyframes -global-flash {
    0%,
    100% {
      filter: brightness(1);
    }
    50% {
      filter: brightness(0.4);
      box-shadow: 0 0 12px rgba(0, 0, 0, 0.5);
    }
  }
</style>
