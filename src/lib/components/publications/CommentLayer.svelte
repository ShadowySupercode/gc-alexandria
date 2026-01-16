<script lang="ts">
  import { getNdkContext, activeInboxRelays, activeOutboxRelays } from "$lib/ndk";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";
  import { NDKEvent as NDKEventClass } from "@nostr-dev-kit/ndk";
  import { communityRelays } from "$lib/consts";
  import { WebSocketPool } from "$lib/data_structures/websocket_pool";
  import { generateMockCommentsForSections } from "$lib/utils/mockCommentData";

  let {
    eventId,
    eventAddress,
    eventIds = [],
    eventAddresses = [],
    comments = $bindable([]),
    useMockComments = false,
  }: {
    eventId?: string;
    eventAddress?: string;
    eventIds?: string[];
    eventAddresses?: string[];
    comments?: NDKEvent[];
    useMockComments?: boolean;
  } = $props();

  const ndk = getNdkContext();

  // State management
  let loading = $state(false);

  /**
   * Fetch comment events (kind 1111) for the current publication using WebSocketPool
   *
   * This follows the exact pattern from HighlightLayer.svelte to ensure reliability.
   * Uses WebSocketPool with nostr-tools protocol instead of NDK subscriptions.
   */
  async function fetchComments() {
    // Prevent concurrent fetches
    if (loading) {
      return;
    }

    // Collect all event IDs and addresses
    const allEventIds = [...(eventId ? [eventId] : []), ...eventIds].filter(Boolean);
    const allAddresses = [...(eventAddress ? [eventAddress] : []), ...eventAddresses].filter(Boolean);

    if (allEventIds.length === 0 && allAddresses.length === 0) {
      console.warn("[CommentLayer] No event IDs or addresses provided");
      return;
    }

    loading = true;
    comments = [];

    // AI-NOTE: Mock mode allows testing comment UI without publishing to relays
    // This is useful for development and demonstrating the comment system
    if (useMockComments) {
      try {
        // Generate mock comment data
        const mockComments = generateMockCommentsForSections(allAddresses);

        // Convert to NDKEvent instances (same as real events)
        comments = mockComments.map(rawEvent => new NDKEventClass(ndk, rawEvent));

        loading = false;
        return;
      } catch (err) {
        console.error(`[CommentLayer] Error generating mock comments:`, err);
        loading = false;
        return;
      }
    }

    try {
      // Build filter for kind 1111 comment events
      // NIP-22: Uppercase tags (A, E, I, K, P) point to root scope (section/publication)
      // Lowercase tags (a, e, i, k, p) point to parent item (comment being replied to)
      // IMPORTANT: Use uppercase #A filter to match NIP-22 root scope tags
      // If we include both #e and #A, relays will only return comments that have BOTH
      const filter: any = {
        kinds: [1111],
        limit: 500,
      };

      // NIP-22: Use uppercase #A filter to match root scope (section addresses)
      // This will fetch both direct comments and replies (replies also have uppercase A tag)
      if (allAddresses.length > 0) {
        filter["#A"] = allAddresses;
        console.debug(`[CommentLayer] Fetching comments for addresses (NIP-22 #A filter):`, allAddresses);
      } else if (allEventIds.length > 0) {
        // Fallback to #e if no addresses available
        filter["#e"] = allEventIds;
        console.debug(`[CommentLayer] Fetching comments for event IDs:`, allEventIds);
      }

      // Build explicit relay set (same pattern as HighlightLayer)
      const relays = [
        ...communityRelays,
        ...$activeOutboxRelays,
        ...$activeInboxRelays,
      ];
      const uniqueRelays = Array.from(new Set(relays));

      /**
       * Use WebSocketPool with nostr-tools protocol instead of NDK
       *
       * Reasons for not using NDK:
       * 1. NDK subscriptions mysteriously returned 0 events even when websocat confirmed events existed
       * 2. Consistency - HighlightLayer, CommentButton, and HighlightSelectionHandler use WebSocketPool
       * 3. Better debugging - direct access to WebSocket messages for troubleshooting
       * 4. Proven reliability - battle-tested in the codebase for similar use cases
       * 5. Performance control - explicit 5s timeout per relay, tunable as needed
       *
       * This matches the pattern in:
       * - src/lib/components/publications/HighlightLayer.svelte:111-212
       * - src/lib/components/publications/CommentButton.svelte:156-220
       * - src/lib/components/publications/HighlightSelectionHandler.svelte:217-280
       */
      const subscriptionId = `comments-${Date.now()}`;
      const receivedEventIds = new Set<string>();
      let responseCount = 0;
      const totalRelays = uniqueRelays.length;

      // AI-NOTE: Helper to check if all relays have responded and clear loading state early
      const checkAllResponses = () => {
        responseCount++;
        if (responseCount >= totalRelays && loading) {
          loading = false;
        }
      };

      const fetchPromises = uniqueRelays.map(async (relayUrl) => {
        try {
          const ws = await WebSocketPool.instance.acquire(relayUrl);

          return new Promise<void>((resolve) => {
            let released = false;
            let resolved = false;
            
            const releaseConnection = () => {
              if (released) {
                return;
              }
              released = true;
              try {
                if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                  ws.send(JSON.stringify(["CLOSE", subscriptionId]));
                }
                ws.removeEventListener("message", messageHandler);
                WebSocketPool.instance.release(ws);
              } catch (err) {
                console.error(`[CommentLayer] Error releasing connection to ${relayUrl}:`, err);
              }
            };
            
            const safeResolve = () => {
              if (!resolved) {
                resolved = true;
                checkAllResponses();
                resolve();
              }
            };
            
            const messageHandler = (event: MessageEvent) => {
              try {
                const message = JSON.parse(event.data);

                if (message[0] === "EVENT" && message[1] === subscriptionId) {
                  const rawEvent = message[2];

                  // Avoid duplicates
                  if (!receivedEventIds.has(rawEvent.id)) {
                    receivedEventIds.add(rawEvent.id);

                    // Convert to NDKEvent
                    const ndkEvent = new NDKEventClass(ndk, rawEvent);
                    
                    // AI-NOTE: Debug logging to track comment reception
                    const aTags = ndkEvent.tags.filter((t: string[]) => t[0] === "a");
                    console.debug(`[CommentLayer] Received comment event:`, {
                      id: rawEvent.id?.substring(0, 8),
                      kind: rawEvent.kind,
                      aTags: aTags.map((t: string[]) => t[1]),
                      content: rawEvent.content?.substring(0, 50),
                    });
                    
                    comments = [...comments, ndkEvent];
                  }
                } else if (message[0] === "EOSE" && message[1] === subscriptionId) {
                  // Close subscription and release connection
                  releaseConnection();
                  safeResolve();
                }
              } catch (err) {
                console.error(`[CommentLayer] Error processing message from ${relayUrl}:`, err);
              }
            };

            ws.addEventListener("message", messageHandler);

            // Send REQ
            const req = ["REQ", subscriptionId, filter];
            ws.send(JSON.stringify(req));

            // Timeout per relay (5 seconds)
            setTimeout(() => {
              releaseConnection();
              safeResolve();
            }, 5000);
          });
        } catch (err) {
          console.error(`[CommentLayer] Error connecting to ${relayUrl}:`, err);
          // Mark this relay as responded if connection fails
          checkAllResponses();
        }
      });

      // Wait for all relays to respond or timeout
      await Promise.allSettled(fetchPromises);
      
      // AI-NOTE: Debug logging to track comment fetching
      console.debug(`[CommentLayer] Fetched ${comments.length} comments for addresses:`, allAddresses);
      if (comments.length > 0) {
        console.debug(`[CommentLayer] Comment addresses:`, comments.map(c => {
          // NIP-22: Look for uppercase A tag (root scope)
          const rootATag = c.tags.find((t: string[]) => t[0] === "A");
          return rootATag ? rootATag[1] : "no-A-tag";
        }));
      }
      
      // Ensure loading is cleared even if checkAllResponses didn't fire
      loading = false;

    } catch (err) {
      console.error(`[CommentLayer] Error fetching comments:`, err);
      loading = false;
    }
  }

  // Track the last fetched event count to know when to refetch
  let lastFetchedCount = $state(0);
  let fetchTimeout: ReturnType<typeof setTimeout> | null = null;
  let lastAddressesString = $state("");

  // Watch for changes to event data - debounce and fetch when data stabilizes
  $effect(() => {
    const currentCount = eventIds.length + eventAddresses.length;
    const hasEventData = currentCount > 0;
    
    // AI-NOTE: Debug logging to track effect execution
    console.debug(`[CommentLayer] Effect running:`, {
      eventIdsCount: eventIds.length,
      eventAddressesCount: eventAddresses.length,
      hasEventData,
      addresses: eventAddresses,
    });
    
    // AI-NOTE: Also track the actual addresses string to detect when addresses change
    // even if the count stays the same (e.g., when commentsVisible toggles)
    const currentAddressesString = JSON.stringify(eventAddresses.sort());

    // Only fetch if:
    // 1. We have event data
    // 2. (The count has changed OR the addresses have changed) since last fetch
    // 3. We're not already loading
    const addressesChanged = currentAddressesString !== lastAddressesString;
    const countChanged = currentCount !== lastFetchedCount;
    
    if (hasEventData && (countChanged || addressesChanged) && !loading) {
      // Clear any existing timeout
      if (fetchTimeout) {
        clearTimeout(fetchTimeout);
      }

      console.debug(`[CommentLayer] Effect triggered: count=${currentCount}, addresses changed=${addressesChanged}, addresses:`, eventAddresses);

      // Debounce: wait 500ms for more events to arrive before fetching
      fetchTimeout = setTimeout(() => {
        lastFetchedCount = currentCount;
        lastAddressesString = currentAddressesString;
        fetchComments();
      }, 500);
    }

    // Cleanup timeout on effect cleanup
    return () => {
      if (fetchTimeout) {
        clearTimeout(fetchTimeout);
      }
    };
  });

  /**
   * Public method to refresh comments (e.g., after creating a new one)
   */
  export function refresh() {
    console.debug(`[CommentLayer] refresh() called, current comments: ${comments.length}`);
    
    // Clear existing comments
    comments = [];

    // Reset fetch count to force re-fetch
    lastFetchedCount = 0;
    
    // Collect current addresses to log what we're fetching
    const allEventIds = [...(eventId ? [eventId] : []), ...eventIds].filter(Boolean);
    const allAddresses = [...(eventAddress ? [eventAddress] : []), ...eventAddresses].filter(Boolean);
    console.debug(`[CommentLayer] Refreshing comments for:`, {
      eventIds: allEventIds,
      addresses: allAddresses,
    });
    
    fetchComments();
  }
</script>

{#if loading}
  <div class="fixed top-40 right-4 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-3">
    <p class="text-sm text-gray-600 dark:text-gray-300">Loading comments...</p>
  </div>
{/if}
