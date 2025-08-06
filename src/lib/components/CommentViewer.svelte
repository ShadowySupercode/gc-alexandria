<script lang="ts">
  import { Button, P, Heading } from "flowbite-svelte";
  import { getUserMetadata } from "$lib/utils/nostrUtils";
  import { neventEncode } from "$lib/utils";
  import { activeInboxRelays, ndkInstance } from "$lib/ndk";
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";

  const { event } = $props<{ event: NDKEvent }>();

  // State for comments and threading
  let comments: NDKEvent[] = $state([]);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let activeSub: any = null;

  // Profile cache for comment authors
  let profileCache = $state(new Map<string, any>());

  interface CommentNode {
    event: NDKEvent;
    children: CommentNode[];
    level: number;
  }

  // AI-NOTE: 2025-01-08 - Clean threaded comment implementation
  // This component fetches and displays threaded comments with proper hierarchy
  function fetchComments() {
    if (!event?.id) return;

    loading = true;
    error = null;

    // Clear previous comments
    comments = [];

    console.log(`[CommentViewer] Fetching comments for event: ${event.id}`);

    // Subscribe to comments that reference this event
    activeSub = $ndkInstance.subscribe({
      kinds: [1, 1111], // Text notes and comments
      "#e": [event.id], // Events that reference this event
    });

    const timeout = setTimeout(() => {
      if (activeSub) {
        activeSub.stop();
        activeSub = null;
      }
      loading = false;
    }, 10000); // 10 second timeout

    activeSub.on("event", (commentEvent: NDKEvent) => {
      // Only add if we haven't seen this event ID yet
      if (!comments.find(c => c.id === commentEvent.id)) {
        comments = [...comments, commentEvent];
        console.log(`[CommentViewer] Found comment: ${commentEvent.id}`);
        
        // Fetch profile for the comment author
        if (commentEvent.pubkey) {
          getUserMetadata(commentEvent.pubkey).then((profile) => {
            profileCache.set(commentEvent.pubkey, profile);
          });
        }
      }
    });

    activeSub.on("eose", () => {
      clearTimeout(timeout);
      if (activeSub) {
        activeSub.stop();
        activeSub = null;
      }
      loading = false;
      console.log(`[CommentViewer] Finished fetching ${comments.length} comments`);
    });

    activeSub.on("error", (err: any) => {
      console.error("[CommentViewer] Subscription error:", err);
      error = "Failed to fetch comments";
      loading = false;
    });
  }

  // Build the threaded comment structure
  function buildCommentThread(events: NDKEvent[]): CommentNode[] {
    if (events.length === 0) return [];

    const eventMap = new Map<string, NDKEvent>();
    const commentMap = new Map<string, CommentNode>();
    const rootComments: CommentNode[] = [];

    // Create nodes for all events
    events.forEach(event => {
      eventMap.set(event.id, event);
      commentMap.set(event.id, {
        event,
        children: [],
        level: 0
      });
    });

    // Build parent-child relationships
    events.forEach(event => {
      const node = commentMap.get(event.id);
      if (!node) return;

      let parentId: string | null = null;

      // Find the immediate parent by looking at e-tags
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
        // Kind 1111: Look for lowercase e-tags (immediate parent)
        for (const tag of eTags) {
          const referencedId = tag[1];
          // Check if this is a lowercase e-tag (immediate parent)
          if (eventMap.has(referencedId) && referencedId !== event.id) {
            parentId = referencedId;
            break;
          }
        }
      }

      // Add to parent or root
      if (parentId && commentMap.has(parentId)) {
        const parent = commentMap.get(parentId);
        if (parent) {
          parent.children.push(node);
          node.level = parent.level + 1;
          console.log(`[CommentViewer] Added ${event.id} as child of ${parentId} at level ${node.level}`);
        }
      } else {
        // This is a root comment (direct reply to the main event)
        rootComments.push(node);
        console.log(`[CommentViewer] Added ${event.id} as root comment`);
      }
    });

    // Sort by creation time (newest first)
    function sortComments(nodes: CommentNode[]): CommentNode[] {
      return nodes.sort((a, b) => (b.event.created_at || 0) - (a.event.created_at || 0));
    }

    function sortRecursive(nodes: CommentNode[]): CommentNode[] {
      const sorted = sortComments(nodes);
      sorted.forEach(node => {
        node.children = sortRecursive(node.children);
      });
      return sorted;
    }

    const result = sortRecursive(rootComments);
    console.log(`[CommentViewer] Built thread with ${result.length} root comments`);
    return result;
  }

  // Derived value for threaded comments
  let threadedComments = $derived(buildCommentThread(comments));

  // Fetch comments when event changes
  $effect(() => {
    if (event?.id) {
      comments = [];
      profileCache.clear();
      if (activeSub) {
        activeSub.stop();
        activeSub = null;
      }
      fetchComments();
    }
  });

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
    return neventEncode(commentEvent, $activeInboxRelays);
  }

  function navigateToComment(commentEvent: NDKEvent) {
    const nevent = getNeventUrl(commentEvent);
    goto(`/events?id=${encodeURIComponent(nevent)}`);
  }

  // Utility functions
  function formatDate(timestamp: number): string {
    return new Date(timestamp * 1000).toLocaleDateString();
  }

  function shortenNevent(nevent: string): string {
    if (nevent.length <= 20) return nevent;
    return nevent.slice(0, 10) + "…" + nevent.slice(-10);
  }

  function getAuthorName(pubkey: string): string {
    const profile = profileCache.get(pubkey);
    return profile?.displayName || profile?.name || "Anonymous";
  }

</script>

<div class="mt-6">
  <Heading tag="h3" class="h-leather mb-4">
    Comments ({threadedComments.length})
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
      <P class="text-gray-500">No comments yet. Be the first to comment!</P>
    </div>
  {:else}
    <div class="space-y-4">
      {#each threadedComments as node (node.event.id)}
        <div class="mb-4">
          <div 
            class="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
            style="margin-left: {node.level * 20}px;"
          >
            <div class="flex justify-between items-start mb-2">
              <div class="flex items-center space-x-2">
                <span class="font-medium text-gray-900 dark:text-white">
                  {getAuthorName(node.event.pubkey)}
                </span>
                <span class="text-sm text-gray-500">
                  {formatDate(node.event.created_at || 0)} Kind: {node.event.kind}
                </span>
              </div>
              <div class="flex items-center space-x-2">
                <span class="text-sm text-gray-600 dark:text-gray-300">
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
            
            <div class="text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
              {@html node.event.content || ""}
            </div>
          </div>
          
          {#if node.children.length > 0}
            {#each node.children as childNode (childNode.event.id)}
              <div class="mb-4">
                <div 
                  class="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
                  style="margin-left: {childNode.level * 20}px;"
                >
                  <div class="flex justify-between items-start mb-2">
                    <div class="flex items-center space-x-2">
                      <span class="font-medium text-gray-900 dark:text-white">
                        {getAuthorName(childNode.event.pubkey)}
                      </span>
                      <span class="text-sm text-gray-500">
                        {formatDate(childNode.event.created_at || 0)} Kind: {childNode.event.kind}
                      </span>
                    </div>
                    <div class="flex items-center space-x-2">
                      <span class="text-sm text-gray-600 dark:text-gray-300">
                        {shortenNevent(getNeventUrl(childNode.event))}
                      </span>
                      <Button
                        size="xs"
                        color="light"
                        onclick={() => navigateToComment(childNode.event)}
                      >
                        View
                      </Button>
                    </div>
                  </div>
                  
                  <div class="text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                    {@html childNode.event.content || ""}
                  </div>
                </div>
              </div>
            {/each}
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div> 