<script lang="ts">
  import type { NDKEvent } from "@nostr-dev-kit/ndk";
  import { getUserMetadata, toNpub } from "$lib/utils/nostrUtils";
  import { getNdkContext } from "$lib/ndk";
  import { basicMarkup } from "$lib/snippets/MarkupSnippets.svelte";
  import { ChevronDownOutline, ChevronRightOutline } from "flowbite-svelte-icons";
  import { nip19 } from "nostr-tools";

  let {
    sectionAddress,
    comments = [],
    visible = true,
  }: {
    sectionAddress: string;
    comments: NDKEvent[];
    visible?: boolean;
  } = $props();

  const ndk = getNdkContext();

  // State management
  let profiles = $state(new Map<string, any>());
  let expandedThreads = $state(new Set<string>());

  /**
   * Parse comment threading structure
   * Root comments have no 'e' tag with 'reply' marker
   */
  function buildThreadStructure(allComments: NDKEvent[]) {
    const rootComments: NDKEvent[] = [];
    const repliesByParent = new Map<string, NDKEvent[]>();

    for (const comment of allComments) {
      // Check if this is a reply by looking for 'e' tags with 'reply' marker
      const replyTag = comment.tags.find(t => t[0] === 'e' && t[3] === 'reply');

      if (replyTag) {
        const parentId = replyTag[1];
        if (!repliesByParent.has(parentId)) {
          repliesByParent.set(parentId, []);
        }
        repliesByParent.get(parentId)!.push(comment);
      } else {
        // This is a root comment (no reply tag)
        rootComments.push(comment);
      }
    }

    return { rootComments, repliesByParent };
  }

  let threadStructure = $derived(buildThreadStructure(comments));

  /**
   * Count replies for a comment thread
   */
  function countReplies(commentId: string, repliesMap: Map<string, NDKEvent[]>): number {
    const directReplies = repliesMap.get(commentId) || [];
    let count = directReplies.length;

    // Recursively count nested replies
    for (const reply of directReplies) {
      count += countReplies(reply.id, repliesMap);
    }

    return count;
  }

  /**
   * Get display name for a pubkey
   */
  function getDisplayName(pubkey: string): string {
    const profile = profiles.get(pubkey);
    if (profile) {
      return profile.displayName || profile.name || profile.pubkey || pubkey;
    }
    const npub = toNpub(pubkey) || pubkey;
    return `${npub.slice(0, 12)}...`;
  }

  /**
   * Format timestamp
   */
  function formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  }

  /**
   * Fetch profile for a pubkey
   */
  async function fetchProfile(pubkey: string) {
    if (profiles.has(pubkey)) return;

    try {
      const npub = toNpub(pubkey);
      if (!npub) {
        setFallbackProfile(pubkey);
        return;
      }

      const profile = await getUserMetadata(npub, ndk, true);
      const newProfiles = new Map(profiles);
      newProfiles.set(pubkey, profile);
      profiles = newProfiles;
    } catch (err) {
      setFallbackProfile(pubkey);
    }
  }

  function setFallbackProfile(pubkey: string) {
    const npub = toNpub(pubkey) || pubkey;
    const truncated = `${npub.slice(0, 12)}...`;
    const fallbackProfile = {
      name: truncated,
      displayName: truncated,
      picture: null
    };
    const newProfiles = new Map(profiles);
    newProfiles.set(pubkey, fallbackProfile);
    profiles = newProfiles;
  }

  /**
   * Toggle thread expansion
   */
  function toggleThread(commentId: string) {
    const newExpanded = new Set(expandedThreads);
    if (newExpanded.has(commentId)) {
      newExpanded.delete(commentId);
    } else {
      newExpanded.add(commentId);
    }
    expandedThreads = newExpanded;
  }

  /**
   * Render nested replies recursively
   */
  function renderReplies(parentId: string, repliesMap: Map<string, NDKEvent[]>, level: number = 0) {
    const replies = repliesMap.get(parentId) || [];
    return replies;
  }

  /**
   * Copy nevent to clipboard
   */
  async function copyNevent(event: NDKEvent) {
    try {
      const nevent = nip19.neventEncode({
        id: event.id,
        author: event.pubkey,
        kind: event.kind,
      });
      await navigator.clipboard.writeText(nevent);
      console.log('Copied nevent to clipboard:', nevent);
    } catch (err) {
      console.error('Failed to copy nevent:', err);
    }
  }

  /**
   * Pre-fetch profiles for all comment authors
   */
  $effect(() => {
    const uniquePubkeys = new Set(comments.map(c => c.pubkey));
    for (const pubkey of uniquePubkeys) {
      fetchProfile(pubkey);
    }
  });
</script>

{#if visible && threadStructure.rootComments.length > 0}
  <div class="space-y-1">
    {#each threadStructure.rootComments as rootComment (rootComment.id)}
      {@const replyCount = countReplies(rootComment.id, threadStructure.repliesByParent)}
      {@const isExpanded = expandedThreads.has(rootComment.id)}

      <div class="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden bg-white dark:bg-gray-800 shadow-sm">
        <!-- Multi-row collapsed view -->
        {#if !isExpanded}
          <div class="flex gap-2 px-3 py-2 text-sm">
            <button
              class="flex-shrink-0 mt-1"
              onclick={() => toggleThread(rootComment.id)}
              aria-label="Expand comment"
            >
              <ChevronRightOutline class="w-3 h-3 text-gray-600 dark:text-gray-400" />
            </button>

            <div class="flex-1 min-w-0">
              <p class="line-clamp-3 text-gray-700 dark:text-gray-300 mb-1">
                {rootComment.content}
              </p>
              <div class="flex items-center gap-2 text-xs">
                <button
                  class="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                  onclick={(e) => { e.stopPropagation(); copyNevent(rootComment); }}
                  title="Copy nevent to clipboard"
                >
                  {getDisplayName(rootComment.pubkey)}
                </button>
                {#if replyCount > 0}
                  <span class="text-gray-400 dark:text-gray-500">•</span>
                  <span class="text-blue-600 dark:text-blue-400">
                    {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
                  </span>
                {/if}
              </div>
            </div>
          </div>
        {:else}
          <!-- Expanded view -->
          <div class="flex flex-col">
            <!-- Expanded header row -->
            <div class="flex items-center gap-2 px-3 py-2 text-sm border-b border-gray-200 dark:border-gray-700">
              <button
                class="flex-shrink-0"
                onclick={() => toggleThread(rootComment.id)}
                aria-label="Collapse comment"
              >
                <ChevronDownOutline class="w-3 h-3 text-gray-600 dark:text-gray-400" />
              </button>

              <button
                class="flex-shrink-0 font-medium text-gray-900 dark:text-gray-100 hover:text-gray-600 dark:hover:text-gray-400 transition-colors"
                onclick={(e) => { e.stopPropagation(); copyNevent(rootComment); }}
                title="Copy nevent to clipboard"
              >
                {getDisplayName(rootComment.pubkey)}
              </button>

              <span class="text-xs text-gray-500 dark:text-gray-400">
                {formatTimestamp(rootComment.created_at || 0)}
              </span>

              {#if replyCount > 0}
                <span class="text-xs text-blue-600 dark:text-blue-400">
                  {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
                </span>
              {/if}
            </div>

            <!-- Full content -->
            <div class="px-3 py-3">
              <div class="text-sm text-gray-700 dark:text-gray-300 prose prose-sm dark:prose-invert max-w-none mb-3">
                {@render basicMarkup(rootComment.content)}
              </div>

              <!-- Replies -->
              {#if replyCount > 0}
                <div class="pl-4 border-l-2 border-gray-200 dark:border-gray-600 space-y-2">
                  {#each renderReplies(rootComment.id, threadStructure.repliesByParent) as reply (reply.id)}
                    <div class="bg-gray-50 dark:bg-gray-700/30 rounded p-3">
                      <div class="flex items-baseline gap-2 mb-2">
                        <button
                          class="text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-gray-600 dark:hover:text-gray-400 transition-colors"
                          onclick={(e) => { e.stopPropagation(); copyNevent(reply); }}
                          title="Copy nevent to clipboard"
                        >
                          {getDisplayName(reply.pubkey)}
                        </button>
                        <span class="text-xs text-gray-500 dark:text-gray-400">
                          {formatTimestamp(reply.created_at || 0)}
                        </span>
                      </div>
                      <div class="text-sm text-gray-700 dark:text-gray-300 prose prose-sm dark:prose-invert max-w-none">
                        {@render basicMarkup(reply.content)}
                      </div>

                      <!-- Nested replies (one level deep) -->
                      {#each renderReplies(reply.id, threadStructure.repliesByParent) as nestedReply (nestedReply.id)}
                        <div class="ml-4 mt-2 bg-gray-100 dark:bg-gray-600/30 rounded p-2">
                          <div class="flex items-baseline gap-2 mb-1">
                            <button
                              class="text-xs font-medium text-gray-900 dark:text-gray-100 hover:text-gray-600 dark:hover:text-gray-400 transition-colors"
                              onclick={(e) => { e.stopPropagation(); copyNevent(nestedReply); }}
                              title="Copy nevent to clipboard"
                            >
                              {getDisplayName(nestedReply.pubkey)}
                            </button>
                            <span class="text-xs text-gray-500 dark:text-gray-400">
                              {formatTimestamp(nestedReply.created_at || 0)}
                            </span>
                          </div>
                          <div class="text-xs text-gray-700 dark:text-gray-300">
                            {@render basicMarkup(nestedReply.content)}
                          </div>
                        </div>
                      {/each}
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    {/each}
  </div>
{/if}

<style>
  /* Ensure proper text wrapping */
  .prose {
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
</style>