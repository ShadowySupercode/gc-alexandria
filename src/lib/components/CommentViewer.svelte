<script lang="ts">
  import { Button, P, Heading } from "flowbite-svelte";
  import { getUserMetadata, toNpub } from "$lib/utils/nostrUtils";
  import { neventEncode } from "$lib/utils";
  import { activeInboxRelays, getNdkContext } from "$lib/ndk";
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";
  import { basicMarkup } from "$lib/snippets/MarkupSnippets.svelte";

  const { event } = $props<{ event: NDKEvent }>();

  const ndk = getNdkContext();

  // AI-NOTE:  Clean, efficient comment viewer implementation
  // This component fetches and displays threaded comments with proper hierarchy
  // Uses simple, reliable profile fetching and efficient state management
  // AI-NOTE:  Added support for kind 9802 highlights (NIP-84)
  // Highlights are displayed with special styling and include source attribution

  // State management
  let comments: NDKEvent[] = $state([]);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let profiles = $state(new Map<string, any>());
  let activeSub: any = null;
  let isFetching = $state(false); // Track if we're currently fetching to prevent duplicate fetches
  let retryCount = $state(0); // Track retry attempts for failed fetches

  interface CommentNode {
    event: NDKEvent;
    children: CommentNode[];
    level: number;
  }

  // Simple profile fetching
  async function fetchProfile(pubkey: string) {
    if (profiles.has(pubkey)) return;

    try {
      const npub = toNpub(pubkey);
      if (!npub) return;

      // Force fetch to ensure we get the latest profile data
      const profile = await getUserMetadata(npub, ndk, true);
      const newProfiles = new Map(profiles);
      newProfiles.set(pubkey, profile);
      profiles = newProfiles;

      console.log(`[CommentViewer] Fetched profile for ${pubkey}:`, profile);
    } catch (err) {
      console.warn(`Failed to fetch profile for ${pubkey}:`, err);
      // Set a fallback profile to avoid repeated failed requests
      const fallbackProfile = {
        name: `${pubkey.slice(0, 8)}...${pubkey.slice(-4)}`,
        displayName: `${pubkey.slice(0, 8)}...${pubkey.slice(-4)}`,
        picture: null,
      };
      const newProfiles = new Map(profiles);
      newProfiles.set(pubkey, fallbackProfile);
      profiles = newProfiles;
    }
  }

  // Fetch comments once when component mounts
  async function fetchComments() {
    if (!event?.id) return;

    // AI-NOTE:  Prevent duplicate fetches for the same event
    if (isFetching) {
      console.log(`[CommentViewer] Already fetching comments, skipping`);
      return;
    }

    isFetching = true;
    loading = true;
    error = null;
    comments = [];
    retryCount = 0; // Reset retry count for new event

    console.log(`[CommentViewer] Fetching comments for event: ${event.id}`);
    console.log(`[CommentViewer] Event kind: ${event.kind}`);
    console.log(`[CommentViewer] Event pubkey: ${event.pubkey}`);
    console.log(
      `[CommentViewer] Available relays: ${$activeInboxRelays.length}`,
    );

    // Wait for relays to be available
    let attempts = 0;
    while ($activeInboxRelays.length === 0 && attempts < 10) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      attempts++;
    }

    if ($activeInboxRelays.length === 0) {
      error = "No relays available";
      loading = false;
      return;
    }

    try {
      // Build address for NIP-22 search if this is a replaceable event
      let eventAddress: string | null = null;
      if (event.kind && event.pubkey) {
        const dTag = event.getMatchingTags("d")[0]?.[1];
        if (dTag) {
          eventAddress = `${event.kind}:${event.pubkey}:${dTag}`;
        }
      }

      console.log(`[CommentViewer] Event address for NIP-22: ${eventAddress}`);

      // AI-NOTE:  Use a single comprehensive filter to ensure all comments are found
      // Multiple filters can cause issues with NDK subscription handling
      const filter = {
        kinds: [1, 1111, 9802],
        "#e": [event.id],
        limit: 100, // Increased limit to ensure we get all comments
      };

      console.log(
        `[CommentViewer] Setting up subscription with filter:`,
        filter,
      );
      console.log(`[CommentViewer] Target event ID: ${event.id}`);
      console.log(`[CommentViewer] Event address: ${eventAddress}`);

      // Use the full NDK pool relays for comprehensive search
      const ndkPoolRelays = Array.from(ndk.pool.relays.values()).map(
        (relay) => relay.url,
      );
      console.log(
        `[CommentViewer] Using ${ndkPoolRelays.length} NDK pool relays for search:`,
        ndkPoolRelays,
      );

      // Subscribe with single filter
      activeSub = ndk.subscribe(filter);

      const timeout = setTimeout(() => {
        console.log(`[CommentViewer] Subscription timeout - no comments found`);
        if (activeSub) {
          activeSub.stop();
          activeSub = null;
        }
        loading = false;
        isFetching = false;
      }, 10000);

      activeSub.on("event", (commentEvent: NDKEvent) => {
        console.log(`[CommentViewer] Received comment: ${commentEvent.id}`);
        console.log(`[CommentViewer] Comment kind: ${commentEvent.kind}`);
        console.log(`[CommentViewer] Comment pubkey: ${commentEvent.pubkey}`);
        console.log(
          `[CommentViewer] Comment content preview: ${commentEvent.content?.slice(0, 100)}...`,
        );

        // Check if this event actually references our target event
        let referencesTarget = false;
        let referenceMethod = "";

        // Check e-tags (standard format)
        const eTags = commentEvent.getMatchingTags("e");
        console.log(
          `[CommentViewer] Checking e-tags:`,
          eTags.map((t) => t[1]),
        );
        console.log(`[CommentViewer] Target event ID: ${event.id}`);
        const hasETag = eTags.some((tag) => tag[1] === event.id);
        console.log(`[CommentViewer] Has matching e-tag: ${hasETag}`);
        if (hasETag) {
          referencesTarget = true;
          referenceMethod = "e-tag";
        }

        // Check a-tags (NIP-22 format) if not found via e-tags
        if (!referencesTarget && eventAddress) {
          const aTags = commentEvent.getMatchingTags("a");
          console.log(
            `[CommentViewer] Checking a-tags:`,
            aTags.map((t) => t[1]),
          );
          console.log(`[CommentViewer] Expected a-tag: ${eventAddress}`);
          const hasATag = aTags.some((tag) => tag[1] === eventAddress);
          console.log(`[CommentViewer] Has matching a-tag: ${hasATag}`);
          if (hasATag) {
            referencesTarget = true;
            referenceMethod = "a-tag";
          }
        }

        if (referencesTarget) {
          console.log(
            `[CommentViewer] Comment references target event via ${referenceMethod} - adding to comments`,
          );
          // AI-NOTE:  Use immutable update to prevent UI flashing
          const newComments = [...comments, commentEvent];
          comments = newComments;
          fetchProfile(commentEvent.pubkey);

          // Fetch nested replies for this comment
          fetchNestedReplies(commentEvent.id);
        } else {
          console.log(
            `[CommentViewer] Comment does not reference target event - skipping`,
          );
          console.log(
            `[CommentViewer] e-tags:`,
            eTags.map((t) => t[1]),
          );
          if (eventAddress) {
            console.log(
              `[CommentViewer] a-tags:`,
              commentEvent.getMatchingTags("a").map((t) => t[1]),
            );
            console.log(`[CommentViewer] expected a-tag:`, eventAddress);
          }
        }
      });

      activeSub.on("eose", () => {
        console.log(
          `[CommentViewer] EOSE received, found ${comments.length} comments`,
        );
        clearTimeout(timeout);
        if (activeSub) {
          activeSub.stop();
          activeSub = null;
        }
        loading = false;
        isFetching = false;
        retryCount = 0; // Reset retry count on successful fetch

        // Pre-fetch all profiles after comments are loaded
        preFetchAllProfiles();

        // AI-NOTE:  Fetch nested replies for all found comments
        comments.forEach((comment) => {
          fetchNestedReplies(comment.id);
        });

        // AI-NOTE:  If no comments found and we haven't retried too many times, try again
        if (comments.length === 0 && retryCount < 2) {
          console.log(
            `[CommentViewer] No comments found, retrying... (attempt ${retryCount + 1})`,
          );
          retryCount++;
          setTimeout(() => {
            if (!isFetching) {
              fetchComments();
            }
          }, 2000); // Wait 2 seconds before retry
        }
      });

      activeSub.on("error", (err: any) => {
        console.error(`[CommentViewer] Subscription error:`, err);
        clearTimeout(timeout);
        if (activeSub) {
          activeSub.stop();
          activeSub = null;
        }
        error = "Error fetching comments";
        loading = false;
        isFetching = false;
      });
    } catch (err) {
      console.error(`[CommentViewer] Error setting up subscription:`, err);
      error = "Error setting up subscription";
      loading = false;
      isFetching = false;
    }
  }

  // Pre-fetch all profiles for comments
  async function preFetchAllProfiles() {
    const uniquePubkeys = new Set<string>();
    comments.forEach((comment) => {
      if (comment.pubkey && !profiles.has(comment.pubkey)) {
        uniquePubkeys.add(comment.pubkey);
      }
    });

    console.log(`[CommentViewer] Pre-fetching ${uniquePubkeys.size} profiles`);

    // Fetch profiles in parallel
    const profilePromises = Array.from(uniquePubkeys).map((pubkey) =>
      fetchProfile(pubkey),
    );
    await Promise.allSettled(profilePromises);

    console.log(`[CommentViewer] Pre-fetching complete`);
  }

  // Build threaded comment structure
  function buildCommentThread(events: NDKEvent[]): CommentNode[] {
    if (events.length === 0) return [];

    const eventMap = new Map<string, NDKEvent>();
    const commentMap = new Map<string, CommentNode>();
    const rootComments: CommentNode[] = [];

    // Create nodes for all events
    events.forEach((event) => {
      eventMap.set(event.id, event);
      commentMap.set(event.id, {
        event,
        children: [],
        level: 0,
      });
    });

    // Build parent-child relationships
    events.forEach((event) => {
      const node = commentMap.get(event.id);
      if (!node) return;

      let parentId: string | null = null;
      const eTags = event.getMatchingTags("e");

      if (event.kind === 1) {
        // Kind 1: Look for the last e-tag that references another comment
        for (let i = eTags.length - 1; i >= 0; i--) {
          const tag = eTags[i];
          const referencedId = tag[1];
          if (eventMap.has(referencedId) && referencedId !== event.id) {
            parentId = referencedId;
            break;
          }
        }
      } else if (event.kind === 1111) {
        // Kind 1111: Use NIP-22 threading format
        // First try to find parent using 'a' tags (NIP-22 parent scope)
        const aTags = event.getMatchingTags("a");
        for (const tag of aTags) {
          const address = tag[1];
          // Extract event ID from address if it's a coordinate
          const parts = address.split(":");
          if (parts.length >= 3) {
            const [kind, pubkey, dTag] = parts;
            // Look for the parent event with this address
            for (const [eventId, parentEvent] of eventMap) {
              if (
                parentEvent.kind === parseInt(kind) &&
                parentEvent.pubkey === pubkey &&
                parentEvent.getMatchingTags("d")[0]?.[1] === dTag
              ) {
                parentId = eventId;
                break;
              }
            }
            if (parentId) break;
          }
        }

        // Fallback to 'e' tags if no parent found via 'a' tags
        if (!parentId) {
          for (const tag of eTags) {
            const referencedId = tag[1];
            if (eventMap.has(referencedId) && referencedId !== event.id) {
              parentId = referencedId;
              break;
            }
          }
        }
      }

      // Add to parent or root
      if (parentId && commentMap.has(parentId)) {
        const parent = commentMap.get(parentId);
        if (parent) {
          parent.children.push(node);
          node.level = parent.level + 1;
        }
      } else {
        rootComments.push(node);
      }
    });

    // Sort by creation time (newest first)
    function sortComments(nodes: CommentNode[]): CommentNode[] {
      return nodes.sort(
        (a, b) => (b.event.created_at || 0) - (a.event.created_at || 0),
      );
    }

    function sortRecursive(nodes: CommentNode[]): CommentNode[] {
      const sorted = sortComments(nodes);
      sorted.forEach((node) => {
        node.children = sortRecursive(node.children);
      });
      return sorted;
    }

    return sortRecursive(rootComments);
  }

  // Derived value for threaded comments
  let threadedComments = $derived(buildCommentThread(comments));

  // AI-NOTE:  Comment feed update issue when navigating via e-tags
  // When clicking e-tags in EventDetails, the comment feed sometimes doesn't update properly
  // This can manifest as:
  // 1. Empty comment feed even when comments exist
  // 2. Flash between nested and flat thread views
  // 3. Delayed comment loading
  //
  // Potential causes:
  // - Race condition between event prop change and comment fetching
  // - Subscription cleanup timing issues
  // - Nested reply fetching interfering with main comment display
  // - Relay availability or timeout issues
  //
  // TODO: Consider adding a small delay before fetching comments to ensure
  // the event prop has fully settled, or implement a more robust state
  // management system for comment fetching
  $effect(() => {
    if (event?.id) {
      console.log(
        `[CommentViewer] Event changed, fetching comments for:`,
        event.id,
        `kind:`,
        event.kind,
      );

      // AI-NOTE:  Clean up previous subscription and reset state
      if (activeSub) {
        activeSub.stop();
        activeSub = null;
      }

      // Reset state for new event
      comments = [];
      profiles = new Map();
      nestedReplyIds = new Set();
      isFetchingNestedReplies = false;
      retryCount = 0;

      // AI-NOTE:  Add small delay to prevent race conditions during navigation
      setTimeout(() => {
        if (event?.id && !isFetching) {
          // Double-check we're not already fetching
          fetchComments();
        }
      }, 100);
    } else {
      // Clear state when no event
      comments = [];
      profiles = new Map();
      nestedReplyIds = new Set();
      isFetchingNestedReplies = false;
      isFetching = false;
      retryCount = 0;
    }
  });

  // AI-NOTE:  Add recursive comment fetching for nested replies
  let isFetchingNestedReplies = $state(false);
  let nestedReplyIds = $state<Set<string>>(new Set());

  // Function to fetch nested replies for a given event
  async function fetchNestedReplies(eventId: string) {
    if (isFetchingNestedReplies || nestedReplyIds.has(eventId)) {
      console.log(
        `[CommentViewer] Skipping nested reply fetch for ${eventId} - already fetching or processed`,
      );
      return;
    }

    console.log(
      `[CommentViewer] Starting nested reply fetch for event: ${eventId}`,
    );
    isFetchingNestedReplies = true;
    nestedReplyIds.add(eventId);

    try {
      console.log(
        `[CommentViewer] Fetching nested replies for event:`,
        eventId,
      );

      // Search for replies to this specific event
      const nestedSub = ndk.subscribe({
        kinds: [1, 1111, 9802],
        "#e": [eventId],
        limit: 50,
      });

      let nestedCount = 0;

      nestedSub.on("event", (nestedEvent: NDKEvent) => {
        console.log(
          `[CommentViewer] Found nested reply:`,
          nestedEvent.id,
          `kind:`,
          nestedEvent.kind,
        );

        // Check if this event actually references the target event
        const eTags = nestedEvent.getMatchingTags("e");
        const referencesTarget = eTags.some((tag) => tag[1] === eventId);

        console.log(
          `[CommentViewer] Nested reply references target:`,
          referencesTarget,
          `eTags:`,
          eTags,
        );

        if (
          referencesTarget &&
          !comments.some((c) => c.id === nestedEvent.id)
        ) {
          console.log(`[CommentViewer] Adding nested reply to comments`);
          // AI-NOTE:  Use immutable update to prevent UI flashing
          const newComments = [...comments, nestedEvent];
          comments = newComments;
          fetchProfile(nestedEvent.pubkey);

          // Recursively fetch replies to this nested reply
          fetchNestedReplies(nestedEvent.id);
        } else if (!referencesTarget) {
          console.log(
            `[CommentViewer] Nested reply does not reference target, skipping`,
          );
        } else {
          console.log(
            `[CommentViewer] Nested reply already exists in comments`,
          );
        }
      });

      nestedSub.on("eose", () => {
        console.log(
          `[CommentViewer] Nested replies EOSE, found ${nestedCount} replies`,
        );
        nestedSub.stop();
        isFetchingNestedReplies = false;
      });

      // Also search for NIP-22 format nested replies
      const event = comments.find((c) => c.id === eventId);
      if (event && event.kind && event.pubkey) {
        const dTag = event.getMatchingTags("d")[0]?.[1];
        if (dTag) {
          const eventAddress = `${event.kind}:${event.pubkey}:${dTag}`;

          const nip22Sub = ndk.subscribe({
            kinds: [1111, 9802],
            "#a": [eventAddress],
            limit: 50,
          });

          nip22Sub.on("event", (nip22Event: NDKEvent) => {
            console.log(
              `[CommentViewer] Found NIP-22 nested reply:`,
              nip22Event.id,
              `kind:`,
              nip22Event.kind,
            );

            const aTags = nip22Event.getMatchingTags("a");
            const referencesTarget = aTags.some(
              (tag) => tag[1] === eventAddress,
            );

            console.log(
              `[CommentViewer] NIP-22 nested reply references target:`,
              referencesTarget,
              `aTags:`,
              aTags,
              `eventAddress:`,
              eventAddress,
            );

            if (
              referencesTarget &&
              !comments.some((c) => c.id === nip22Event.id)
            ) {
              console.log(
                `[CommentViewer] Adding NIP-22 nested reply to comments`,
              );
              // AI-NOTE:  Use immutable update to prevent UI flashing
              const newComments = [...comments, nip22Event];
              comments = newComments;
              fetchProfile(nip22Event.pubkey);

              // Recursively fetch replies to this nested reply
              fetchNestedReplies(nip22Event.id);
            } else if (!referencesTarget) {
              console.log(
                `[CommentViewer] NIP-22 nested reply does not reference target, skipping`,
              );
            } else {
              console.log(
                `[CommentViewer] NIP-22 nested reply already exists in comments`,
              );
            }
          });

          nip22Sub.on("eose", () => {
            console.log(`[CommentViewer] NIP-22 nested replies EOSE`);
            nip22Sub.stop();
          });
        }
      }
    } catch (err) {
      console.error(`[CommentViewer] Error fetching nested replies:`, err);
      isFetchingNestedReplies = false;
    }
  }

  // Cleanup on unmount
  onMount(() => {
    return () => {
      if (activeSub) {
        activeSub.stop();
        activeSub = null;
      }
    };
  });

  // Navigation functions
  function getNeventUrl(commentEvent: NDKEvent): string {
    try {
      console.log(
        `[CommentViewer] Generating nevent for:`,
        commentEvent.id,
        `kind:`,
        commentEvent.kind,
      );
      const nevent = neventEncode(commentEvent, $activeInboxRelays);
      console.log(`[CommentViewer] Generated nevent:`, nevent);
      return nevent;
    } catch (error) {
      console.error(`[CommentViewer] Error generating nevent:`, error);
      // Fallback to just the event ID
      return commentEvent.id;
    }
  }

  // AI-NOTE:  View button functionality is working correctly
  // This function navigates to the specific event as the main event, allowing
  // users to view replies as the primary content
  function navigateToComment(commentEvent: NDKEvent) {
    try {
      const nevent = getNeventUrl(commentEvent);
      console.log(`[CommentViewer] Navigating to comment:`, nevent);
      goto(`/events?id=${encodeURIComponent(nevent)}`);
    } catch (error) {
      console.error(`[CommentViewer] Error navigating to comment:`, error);
      // Fallback to event ID
      goto(`/events?id=${commentEvent.id}`);
    }
  }

  // Utility functions
  function formatDate(timestamp: number): string {
    return new Date(timestamp * 1000).toLocaleDateString();
  }

  function formatRelativeDate(timestamp: number): string {
    const now = Date.now();
    const date = timestamp * 1000;
    const diffInSeconds = Math.floor((now - date) / 1000);

    if (diffInSeconds < 60) {
      return `${diffInSeconds} seconds ago`;
    }

    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) {
      return `${diffInMinutes} minute${diffInMinutes !== 1 ? "s" : ""} ago`;
    }

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) {
      return `${diffInHours} hour${diffInHours !== 1 ? "s" : ""} ago`;
    }

    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) {
      return `${diffInDays} day${diffInDays !== 1 ? "s" : ""} ago`;
    }

    const diffInWeeks = Math.floor(diffInDays / 7);
    if (diffInWeeks < 4) {
      return `${diffInWeeks} week${diffInWeeks !== 1 ? "s" : ""} ago`;
    }

    const diffInMonths = Math.floor(diffInDays / 30);
    if (diffInMonths < 12) {
      return `${diffInMonths} month${diffInMonths !== 1 ? "s" : ""} ago`;
    }

    const diffInYears = Math.floor(diffInDays / 365);
    return `${diffInYears} year${diffInYears !== 1 ? "s" : ""} ago`;
  }

  function shortenNevent(nevent: string): string {
    if (nevent.length <= 20) return nevent;
    return nevent.slice(0, 10) + "…" + nevent.slice(-10);
  }

  function getAuthorName(pubkey: string): string {
    const profile = profiles.get(pubkey);
    if (profile?.displayName) return profile.displayName;
    if (profile?.name) return profile.name;
    return `${pubkey.slice(0, 8)}...${pubkey.slice(-4)}`;
  }

  function getAuthorPicture(pubkey: string): string | null {
    const profile = profiles.get(pubkey);
    return profile?.picture || null;
  }

  function getIndentation(level: number): string {
    const maxLevel = 5;
    const actualLevel = Math.min(level, maxLevel);
    return `${actualLevel * 16}px`;
  }

  // AI-NOTE:  Get highlight source information
  function getHighlightSource(
    highlightEvent: NDKEvent,
  ): { type: string; value: string; url?: string } | null {
    // Check for e-tags (nostr events)
    const eTags = highlightEvent.getMatchingTags("e");
    if (eTags.length > 0) {
      return { type: "nostr_event", value: eTags[0][1] };
    }

    // Check for r-tags (URLs)
    const rTags = highlightEvent.getMatchingTags("r");
    if (rTags.length > 0) {
      return { type: "url", value: rTags[0][1], url: rTags[0][1] };
    }

    return null;
  }

  // AI-NOTE:  Get highlight attribution
  function getHighlightAttribution(
    highlightEvent: NDKEvent,
  ): Array<{ pubkey: string; role?: string }> {
    const pTags = highlightEvent.getMatchingTags("p");
    return pTags.map((tag) => ({
      pubkey: tag[1],
      role: tag[3] || undefined,
    }));
  }

  // AI-NOTE:  Check if highlight has comment
  function hasHighlightComment(highlightEvent: NDKEvent): boolean {
    return highlightEvent.getMatchingTags("comment").length > 0;
  }
</script>

<!-- Recursive Comment Item Component -->
{#snippet CommentItem(node: CommentNode)}
  {@const comment =
    node.event.getMatchingTags("comment")[0]?.[1] || "No comment content"}
  <div class="mb-4">
    <div
      class="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 break-words"
      style="margin-left: {getIndentation(node.level)};"
    >
      <div class="flex justify-between items-start mb-2">
        <div class="flex items-center space-x-2">
          <button
            class="cursor-pointer"
            onclick={() => goto(`/events?n=${toNpub(node.event.pubkey)}`)}
          >
            {#if getAuthorPicture(node.event.pubkey)}
              <img
                src={getAuthorPicture(node.event.pubkey)}
                alt={getAuthorName(node.event.pubkey)}
                class="w-8 h-8 rounded-full object-cover hover:opacity-80 transition-opacity"
                onerror={(e) =>
                  ((e.target as HTMLImageElement).style.display = "none")}
              />
            {:else}
              <div
                class="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center hover:opacity-80 transition-opacity"
              >
                <span
                  class="text-sm font-medium text-gray-600 dark:text-gray-300"
                >
                  {getAuthorName(node.event.pubkey).charAt(0).toUpperCase()}
                </span>
              </div>
            {/if}
          </button>
          <div class="flex flex-col min-w-0">
            <button
              class="font-medium text-gray-900 dark:text-white truncate hover:underline cursor-pointer text-left"
              onclick={() => goto(`/events?n=${toNpub(node.event.pubkey)}`)}
            >
              {getAuthorName(node.event.pubkey)}
            </button>
            <span
              class="text-sm text-gray-500 cursor-help"
              title={formatDate(node.event.created_at || 0)}
            >
              {formatRelativeDate(node.event.created_at || 0)} • Kind: {node
                .event.kind}
            </span>
          </div>
        </div>
        <div class="flex items-center space-x-2 flex-shrink-0">
          <span
            class="text-sm text-gray-600 dark:text-gray-300 truncate max-w-32"
          >
            {shortenNevent(getNeventUrl(node.event))}
          </span>
          <Button
            size="xs"
            color="light"
            onclick={() => navigateToComment(node.event)}
          >
            View
          </Button>
        </div>
      </div>

      <div
        class="text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words overflow-hidden"
      >
        {#if node.event.kind === 9802}
          <!-- Highlight rendering -->
          <div
            class="highlight-container bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 p-3 rounded-r"
          >
            {#if hasHighlightComment(node.event)}
              <!-- Quote highlight with comment -->
              <div
                class="highlight-quote bg-gray-50 dark:bg-gray-800 p-3 rounded mb-3 border-l-4 border-blue-400"
              >
                <div class="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  <span class="font-medium">Highlighted content:</span>
                </div>
                {#if node.event.getMatchingTags("context")[0]?.[1]}
                  <div class="highlight-context">
                    {@html node.event.getMatchingTags("context")[0]?.[1]}
                  </div>
                {:else}
                  <div
                    class="highlight-content text-gray-800 dark:text-gray-200"
                  >
                    {node.event.content || ""}
                  </div>
                {/if}
                {#if getHighlightSource(node.event)}
                  <div class="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    Source: {getHighlightSource(node.event)?.type ===
                    "nostr_event"
                      ? "Nostr Event"
                      : "URL"}
                  </div>
                {/if}
              </div>
              <div class="highlight-comment">
                <div class="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  <span class="font-medium">Comment:</span>
                </div>
                <div class="text-sm text-gray-700 dark:text-gray-300">
                  {@render basicMarkup(comment, ndk)}
                </div>
              </div>
            {:else}
              <!-- Simple highlight -->
              {#if node.event.getMatchingTags("context")[0]?.[1]}
                <div class="highlight-context">
                  {@html node.event.getMatchingTags("context")[0]?.[1]}
                </div>
              {:else}
                <div class="highlight-content">
                  {node.event.content || ""}
                </div>
              {/if}

              {#if getHighlightSource(node.event)}
                <div class="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Source: {getHighlightSource(node.event)?.type ===
                  "nostr_event"
                    ? "Nostr Event"
                    : "URL"}
                </div>
              {/if}
            {/if}

            {#if getHighlightAttribution(node.event).length > 0}
              <div class="text-xs text-gray-500 dark:text-gray-400 mt-2">
                <span class="font-medium">Attribution:</span>
                {#each getHighlightAttribution(node.event) as attribution}
                  <button
                    class="ml-1 text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                    onclick={() =>
                      goto(`/events?n=${toNpub(attribution.pubkey)}`)}
                  >
                    {getAuthorName(attribution.pubkey)}
                    {#if attribution.role}
                      <span class="text-gray-400">({attribution.role})</span>
                    {/if}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {:else}
          <!-- Regular comment content -->
          <div class="text-sm text-gray-700 dark:text-gray-300">
            {@render basicMarkup(node.event.content || "No content", ndk)}
          </div>
        {/if}
      </div>
    </div>

    {#if node.children.length > 0}
      <div class="space-y-4">
        {#each node.children as childNode, index (childNode.event.id + "-" + index)}
          {@render CommentItem(childNode)}
        {/each}
      </div>
    {/if}
  </div>
{/snippet}

<div class="mt-6">
  <Heading tag="h3" class="h-leather mb-4">
    Comments & Highlights ({threadedComments.length})
  </Heading>

  {#if loading}
    <div class="text-center py-4">
      <P>Loading comments...</P>
    </div>
  {:else if error}
    <div class="text-center py-4">
      <P class="text-red-600">{error}</P>
    </div>
  {:else if threadedComments.length === 0}
    <div class="text-center py-4">
      <P class="text-gray-500"
        >No comments or highlights yet. Be the first to engage!</P
      >
    </div>
  {:else}
    <div class="space-y-4">
      {#each threadedComments as node, index (node.event.id + "-root-" + index)}
        {@render CommentItem(node)}
      {/each}
    </div>
  {/if}
</div>

<style>
  /* Highlight styles */
  .highlight-container {
    position: relative;
  }

  .highlight-content {
    font-style: italic;
    background: linear-gradient(
      transparent 0%,
      transparent 40%,
      rgba(255, 255, 0, 0.3) 40%,
      rgba(255, 255, 0, 0.3) 100%
    );
  }

  .highlight-quote {
    position: relative;
  }

  .highlight-quote::before {
    content: '"';
    position: absolute;
    top: -5px;
    left: -10px;
    font-size: 2rem;
    color: #3b82f6;
    opacity: 0.5;
  }

  .highlight-context {
    color: #6b7280;
    font-size: 0.875rem;
    margin-bottom: 0.5rem;
    opacity: 0.8;
  }
</style>
