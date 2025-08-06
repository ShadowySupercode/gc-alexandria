<script lang="ts">
  import { Button, P, Heading } from "flowbite-svelte";
  import { getUserMetadata, toNpub } from "$lib/utils/nostrUtils";
  import { neventEncode } from "$lib/utils";
  import { activeInboxRelays, ndkInstance } from "$lib/ndk";
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";
  import { userBadge } from "$lib/snippets/UserSnippets.svelte";
  import { parseBasicmarkup } from "$lib/utils/markup/basicMarkupParser";

  const { event } = $props<{ event: NDKEvent }>();

  // AI-NOTE: 2025-01-08 - Clean, efficient comment viewer implementation
  // This component fetches and displays threaded comments with proper hierarchy
  // Uses simple, reliable profile fetching and efficient state management

  // State management
  let comments: NDKEvent[] = $state([]);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let profiles = $state(new Map<string, any>());
  let activeSub: any = null;

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
      
      const profile = await getUserMetadata(npub);
      const newProfiles = new Map(profiles);
      newProfiles.set(pubkey, profile);
      profiles = newProfiles;
    } catch (err) {
      console.warn(`Failed to fetch profile for ${pubkey}:`, err);
    }
  }

  // Fetch comments once when component mounts
  async function fetchComments() {
    if (!event?.id) return;
    
    loading = true;
    error = null;
    comments = [];
    
    console.log(`[CommentViewer] Fetching comments for event: ${event.id}`);
    
    // Wait for relays to be available
    let attempts = 0;
    while ($activeInboxRelays.length === 0 && attempts < 10) {
      await new Promise(resolve => setTimeout(resolve, 500));
      attempts++;
    }
    
    if ($activeInboxRelays.length === 0) {
      error = "No relays available";
      loading = false;
      return;
    }
    
    try {
      activeSub = $ndkInstance.subscribe({
        kinds: [1, 1111],
        "#e": [event.id],
      });
      
      const timeout = setTimeout(() => {
        if (activeSub) {
          activeSub.stop();
          activeSub = null;
        }
        loading = false;
      }, 10000);
      
      activeSub.on("event", (commentEvent: NDKEvent) => {
        console.log(`[CommentViewer] Received comment: ${commentEvent.id}`);
        comments = [...comments, commentEvent];
        fetchProfile(commentEvent.pubkey);
      });
      
      activeSub.on("eose", () => {
        console.log(`[CommentViewer] EOSE received, found ${comments.length} comments`);
        clearTimeout(timeout);
        if (activeSub) {
          activeSub.stop();
          activeSub = null;
        }
        loading = false;
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
      });
      
    } catch (err) {
      console.error(`[CommentViewer] Error setting up subscription:`, err);
      error = "Error setting up subscription";
      loading = false;
    }
  }

  // Build threaded comment structure
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
        }
      } else {
        rootComments.push(node);
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
    
    return sortRecursive(rootComments);
  }

  // Derived value for threaded comments
  let threadedComments = $derived(buildCommentThread(comments));

  // Fetch comments when event changes
  $effect(() => {
    if (event?.id) {
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

  function formatRelativeDate(timestamp: number): string {
    const now = Date.now();
    const date = timestamp * 1000;
    const diffInSeconds = Math.floor((now - date) / 1000);
    
    if (diffInSeconds < 60) {
      return `${diffInSeconds} seconds ago`;
    }
    
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) {
      return `${diffInMinutes} minute${diffInMinutes !== 1 ? 's' : ''} ago`;
    }
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) {
      return `${diffInHours} hour${diffInHours !== 1 ? 's' : ''} ago`;
    }
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) {
      return `${diffInDays} day${diffInDays !== 1 ? 's' : ''} ago`;
    }
    
    const diffInWeeks = Math.floor(diffInDays / 7);
    if (diffInWeeks < 4) {
      return `${diffInWeeks} week${diffInWeeks !== 1 ? 's' : ''} ago`;
    }
    
    const diffInMonths = Math.floor(diffInDays / 30);
    if (diffInMonths < 12) {
      return `${diffInMonths} month${diffInMonths !== 1 ? 's' : ''} ago`;
    }
    
    const diffInYears = Math.floor(diffInDays / 365);
    return `${diffInYears} year${diffInYears !== 1 ? 's' : ''} ago`;
  }

  function shortenNevent(nevent: string): string {
    if (nevent.length <= 20) return nevent;
    return nevent.slice(0, 10) + "…" + nevent.slice(-10);
  }

  function getAuthorName(pubkey: string): string {
    const profile = profiles.get(pubkey);
    return profile?.displayName || profile?.name || `${pubkey.slice(0, 8)}...${pubkey.slice(-4)}`;
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

  async function parseContent(content: string): Promise<string> {
    if (!content) return "";
    
    let parsedContent = await parseBasicmarkup(content);
    
    return parsedContent;
  }
</script>

<!-- Recursive Comment Item Component -->
{#snippet CommentItem(node: CommentNode)}
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
                onerror={(e) => (e.target as HTMLImageElement).style.display = 'none'}
              />
            {:else}
              <div class="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center hover:opacity-80 transition-opacity">
                <span class="text-sm font-medium text-gray-600 dark:text-gray-300">
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
              {formatRelativeDate(node.event.created_at || 0)} • Kind: {node.event.kind}
            </span>
          </div>
        </div>
        <div class="flex items-center space-x-2 flex-shrink-0">
          <span class="text-sm text-gray-600 dark:text-gray-300 truncate max-w-32">
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
      
      <div class="text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words overflow-hidden">
        {#await parseContent(node.event.content || "") then parsedContent}
          {@html parsedContent}
        {:catch}
          {@html node.event.content || ""}
        {/await}
      </div>
    </div>
    
    {#if node.children.length > 0}
      <div class="space-y-4">
        {#each node.children as childNode (childNode.event.id)}
          {@render CommentItem(childNode)}
        {/each}
      </div>
    {/if}
  </div>
{/snippet}

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
        {@render CommentItem(node)}
      {/each}
    </div>
  {/if}
</div> 