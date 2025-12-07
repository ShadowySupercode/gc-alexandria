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
      console.log("[CommentLayer] Already loading, skipping fetch");
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
      console.log(`[CommentLayer] MOCK MODE - Generating mock comments for ${allAddresses.length} sections`);

      try {
        // Generate mock comment data
        const mockComments = generateMockCommentsForSections(allAddresses);

        // Convert to NDKEvent instances (same as real events)
        comments = mockComments.map(rawEvent => new NDKEventClass(ndk, rawEvent));

        console.log(`[CommentLayer] Generated ${comments.length} mock comments`);
        loading = false;
        return;
      } catch (err) {
        console.error(`[CommentLayer] Error generating mock comments:`, err);
        loading = false;
        return;
      }
    }

    console.log(`[CommentLayer] Fetching comments for:`, {
      eventIds: allEventIds,
      addresses: allAddresses
    });

    try {
      // Build filter for kind 1111 comment events
      // IMPORTANT: Use only #a tags because filters are AND, not OR
      // If we include both #e and #a, relays will only return comments that have BOTH
      const filter: any = {
        kinds: [1111],
        limit: 500,
      };

      // Prefer #a (addressable events) since they're more specific and persistent
      if (allAddresses.length > 0) {
        filter["#a"] = allAddresses;
      } else if (allEventIds.length > 0) {
        // Fallback to #e if no addresses available
        filter["#e"] = allEventIds;
      }

      console.log(`[CommentLayer] Fetching with filter:`, JSON.stringify(filter, null, 2));

      // Build explicit relay set (same pattern as HighlightLayer)
      const relays = [
        ...communityRelays,
        ...$activeOutboxRelays,
        ...$activeInboxRelays,
      ];
      const uniqueRelays = Array.from(new Set(relays));
      console.log(`[CommentLayer] Fetching from ${uniqueRelays.length} relays:`, uniqueRelays);

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
      let eoseCount = 0;

      const fetchPromises = uniqueRelays.map(async (relayUrl) => {
        try {
          console.log(`[CommentLayer] Connecting to ${relayUrl}`);
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
                resolve();
              }
            };
            
            const messageHandler = (event: MessageEvent) => {
              try {
                const message = JSON.parse(event.data);

                // Log ALL messages from relay.nostr.band for debugging
                if (relayUrl.includes('relay.nostr.band')) {
                  console.log(`[CommentLayer] RAW message from ${relayUrl}:`, message);
                }

                if (message[0] === "EVENT" && message[1] === subscriptionId) {
                  const rawEvent = message[2];
                  console.log(`[CommentLayer] EVENT from ${relayUrl}:`, {
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
                    comments = [...comments, ndkEvent];
                    console.log(`[CommentLayer] Added comment, total now: ${comments.length}`);
                  }
                } else if (message[0] === "EOSE" && message[1] === subscriptionId) {
                  eoseCount++;
                  console.log(`[CommentLayer] EOSE from ${relayUrl} (${eoseCount}/${uniqueRelays.length})`);

                  // Close subscription and release connection
                  releaseConnection();
                  safeResolve();
                } else if (message[0] === "NOTICE") {
                  console.warn(`[CommentLayer] NOTICE from ${relayUrl}:`, message[1]);
                }
              } catch (err) {
                console.error(`[CommentLayer] Error processing message from ${relayUrl}:`, err);
              }
            };

            ws.addEventListener("message", messageHandler);

            // Send REQ
            const req = ["REQ", subscriptionId, filter];
            if (relayUrl.includes('relay.nostr.band')) {
              console.log(`[CommentLayer] Sending REQ to ${relayUrl}:`, JSON.stringify(req));
            } else {
              console.log(`[CommentLayer] Sending REQ to ${relayUrl}`);
            }
            ws.send(JSON.stringify(req));

            // Timeout per relay (5 seconds)
            setTimeout(() => {
              releaseConnection();
              safeResolve();
            }, 5000);
          });
        } catch (err) {
          console.error(`[CommentLayer] Error connecting to ${relayUrl}:`, err);
        }
      });

      // Wait for all relays to respond or timeout
      await Promise.all(fetchPromises);

      console.log(`[CommentLayer] Fetched ${comments.length} comments`);

      if (comments.length > 0) {
        console.log(`[CommentLayer] Comments summary:`, comments.map(c => ({
          content: c.content.substring(0, 30) + "...",
          address: c.tags.find(t => t[0] === "a")?.[1],
          author: c.pubkey.substring(0, 8)
        })));
      }

      loading = false;

    } catch (err) {
      console.error(`[CommentLayer] Error fetching comments:`, err);
      loading = false;
    }
  }

  // Track the last fetched event count to know when to refetch
  let lastFetchedCount = $state(0);
  let fetchTimeout: ReturnType<typeof setTimeout> | null = null;

  // Watch for changes to event data - debounce and fetch when data stabilizes
  $effect(() => {
    const currentCount = eventIds.length + eventAddresses.length;
    const hasEventData = currentCount > 0;

    console.log(`[CommentLayer] Event data effect - count: ${currentCount}, lastFetched: ${lastFetchedCount}, loading: ${loading}`);

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
        console.log(`[CommentLayer] Event data stabilized at ${currentCount} events, fetching comments...`);
        lastFetchedCount = currentCount;
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
    console.log("[CommentLayer] Manual refresh triggered");

    // Clear existing comments
    comments = [];

    // Reset fetch count to force re-fetch
    lastFetchedCount = 0;
    fetchComments();
  }
</script>

{#if loading}
  <div class="fixed top-40 right-4 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-3">
    <p class="text-sm text-gray-600 dark:text-gray-300">Loading comments...</p>
  </div>
{/if}
