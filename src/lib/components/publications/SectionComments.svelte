<script lang="ts">
  import type { NDKEvent } from "@nostr-dev-kit/ndk";
  import { getUserMetadata, toNpub } from "$lib/utils/nostrUtils";
  import { getNdkContext } from "$lib/ndk";
  import { basicMarkup } from "$lib/snippets/MarkupSnippets.svelte";
  import { ChevronDownOutline, ChevronRightOutline, DotsVerticalOutline, TrashBinOutline, ClipboardCleanOutline, EyeOutline } from "flowbite-svelte-icons";
  import { nip19 } from "nostr-tools";
  import { Button, Popover, Modal, Textarea, P } from "flowbite-svelte";
  import { deleteEvent, canDeleteEvent } from "$lib/services/deletion";
  import { userStore } from "$lib/stores/userStore";
  import { goto } from "$app/navigation";

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
  let detailsModalOpen = $state<string | null>(null);
  let deletingComments = $state(new Set<string>());
  let replyingTo = $state<string | null>(null);
  let replyContent = $state("");
  let isSubmittingReply = $state(false);
  let replyError = $state<string | null>(null);
  let replySuccess = $state<string | null>(null);

  // Subscribe to userStore
  let user = $derived($userStore);

  /**
   * Parse comment threading structure according to NIP-22
   * NIP-22: Uppercase tags (A, E, I, K, P) = root scope
   * Lowercase tags (a, e, i, k, p) = parent item (comment being replied to)
   * Root comments have no lowercase e tag (or lowercase e tag pointing to section itself)
   * Replies have lowercase e tag pointing to parent comment ID
   */
  function buildThreadStructure(allComments: NDKEvent[]) {
    const rootComments: NDKEvent[] = [];
    const repliesByParent = new Map<string, NDKEvent[]>();
    // AI-NOTE: Normalize comment IDs to lowercase for consistent matching
    const allCommentIds = new Set(allComments.map(c => c.id?.toLowerCase()).filter(Boolean));

    // AI-NOTE: Debug logging to track comment threading
    console.debug(`[SectionComments] Building thread structure from ${allComments.length} comments (NIP-22)`);

    // NIP-22: First pass - identify replies by looking for lowercase e tags
    // Lowercase e tags point to the parent comment ID
    for (const comment of allComments) {
      // NIP-22: Look for lowercase e tag (parent item reference)
      const lowercaseETags = comment.tags.filter(t => t[0] === 'e');
      
      if (lowercaseETags.length > 0) {
        // Check if any lowercase e tag points to a comment in our set
        let isReply = false;
        for (const eTag of lowercaseETags) {
          const parentId = eTag[1]?.trim().toLowerCase();
          
          if (!parentId) {
            continue;
          }
          
          // NIP-22: If lowercase e tag points to a comment in our set, it's a reply
          if (allCommentIds.has(parentId)) {
            isReply = true;
            
            if (!repliesByParent.has(parentId)) {
              repliesByParent.set(parentId, []);
            }
            repliesByParent.get(parentId)!.push(comment);
            console.debug(`[SectionComments] Comment ${comment.id?.substring(0, 8)} is a reply to ${parentId.substring(0, 8)} (NIP-22 lowercase e tag)`);
            break; // Found parent, no need to check other e tags
          }
        }
        
        if (!isReply) {
          // Has lowercase e tag but doesn't reference any comment in our set
          // This might be a root comment that references an external event, or malformed
          rootComments.push(comment);
          console.debug(`[SectionComments] Comment ${comment.id?.substring(0, 8)} is a root comment (lowercase e tag references external event)`);
        }
      } else {
        // No lowercase e tags - this is a root comment
        rootComments.push(comment);
        console.debug(`[SectionComments] Comment ${comment.id?.substring(0, 8)} is a root comment (no lowercase e tags)`);
      }
    }

    console.debug(`[SectionComments] Thread structure: ${rootComments.length} root comments, ${repliesByParent.size} reply groups`);
    // AI-NOTE: Log reply details for debugging
    for (const [parentId, replies] of repliesByParent.entries()) {
      console.debug(`[SectionComments] Parent ${parentId.substring(0, 8)} has ${replies.length} replies:`, replies.map(r => r.id?.substring(0, 8)));
    }
    return { rootComments, repliesByParent };
  }

  let threadStructure = $derived.by(() => {
    const structure = buildThreadStructure(comments);
    // AI-NOTE: Debug logging when structure changes
    if (structure.rootComments.length > 0 || comments.length > 0) {
      console.debug(`[SectionComments] Thread structure updated:`, {
        totalComments: comments.length,
        rootComments: structure.rootComments.length,
        replyGroups: structure.repliesByParent.size,
        visible,
      });
    }
    return structure;
  });

  /**
   * Count replies for a comment thread
   */
  function countReplies(commentId: string, repliesMap: Map<string, NDKEvent[]>): number {
    // AI-NOTE: Normalize comment ID for lookup (must match how we stored it)
    const normalizedCommentId = commentId?.trim().toLowerCase();
    const directReplies = repliesMap.get(normalizedCommentId) || [];
    let count = directReplies.length;

    // AI-NOTE: Debug logging to track reply counting
    if (directReplies.length > 0) {
      console.debug(`[SectionComments] Found ${directReplies.length} direct replies for comment ${normalizedCommentId.substring(0, 8)}`);
    }

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
    // AI-NOTE: Normalize parent ID for lookup (must match how we stored it)
    const normalizedParentId = parentId?.trim().toLowerCase();
    const replies = repliesMap.get(normalizedParentId) || [];
    
    // AI-NOTE: Debug logging to track reply rendering
    if (replies.length > 0) {
      console.debug(`[SectionComments] Rendering ${replies.length} replies for parent ${normalizedParentId.substring(0, 8)}`);
    } else {
      // AI-NOTE: Debug when no replies found - check if map has any entries for similar IDs
      const allParentIds = Array.from(repliesMap.keys());
      const similarIds = allParentIds.filter(id => id.substring(0, 8) === normalizedParentId.substring(0, 8));
      if (similarIds.length > 0) {
        console.debug(`[SectionComments] No replies found for ${normalizedParentId.substring(0, 8)}, but found similar IDs:`, similarIds.map(id => id.substring(0, 8)));
      }
    }
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
   * Navigate to event details page
   */
  function viewEventDetails(comment: NDKEvent) {
    const nevent = nip19.neventEncode({
      id: comment.id,
      author: comment.pubkey,
      kind: comment.kind,
    });
    goto(`/events?id=${encodeURIComponent(nevent)}`);
  }

  /**
   * Check if user can delete a comment
   */
  function canDelete(comment: NDKEvent): boolean {
    return canDeleteEvent(comment, ndk);
  }

  /**
   * Submit a reply to a comment
   */
  async function submitReply(parentComment: NDKEvent) {
    if (!replyContent.trim()) {
      replyError = "Reply cannot be empty";
      return;
    }

    if (!user.signedIn || !user.signer) {
      replyError = "You must be signed in to reply";
      return;
    }

    isSubmittingReply = true;
    replyError = null;
    replySuccess = null;

    try {
      const { NDKEvent: NDKEventClass } = await import("@nostr-dev-kit/ndk");
      const { activeOutboxRelays } = await import("$lib/ndk");

      // Get relay hint
      const relays = activeOutboxRelays;
      let relayHint = "";
      relays.subscribe((r) => { relayHint = r[0] || ""; })();

      // Create reply event (kind 1111)
      const replyEvent = new NDKEventClass(ndk);
      replyEvent.kind = 1111;
      replyEvent.content = replyContent;

      // Parse section address to get root event details
      const rootParts = sectionAddress.split(":");
      if (rootParts.length !== 3) {
        throw new Error("Invalid section address format");
      }
      const [rootKindStr, rootAuthorPubkey, rootDTag] = rootParts;
      const rootKind = parseInt(rootKindStr);

      // NIP-22 reply tags structure:
      // - Root tags (A, K, P) point to the section/article
      // - Parent tags (a, k, p) point to the parent comment
      // - Add 'e' tag with 'reply' marker for the parent comment
      replyEvent.tags = [
        // Root scope - uppercase tags (point to section)
        ["A", sectionAddress, relayHint, rootAuthorPubkey],
        ["K", rootKind.toString()],
        ["P", rootAuthorPubkey, relayHint],

        // Parent scope - lowercase tags (point to parent comment)
        ["a", `1111:${parentComment.pubkey}:`, relayHint],
        ["k", "1111"],
        ["p", parentComment.pubkey, relayHint],

        // Reply marker
        ["e", parentComment.id, relayHint, "reply"],
      ];

      console.log("[SectionComments] Creating reply with tags:", replyEvent.tags);

      // Sign and publish
      await replyEvent.sign();
      await replyEvent.publish();

      console.log("[SectionComments] Reply published:", replyEvent.id);

      replySuccess = parentComment.id;
      replyContent = "";

      // Close reply UI after a delay
      setTimeout(() => {
        replyingTo = null;
        replySuccess = null;
      }, 2000);

    } catch (err) {
      console.error("[SectionComments] Error submitting reply:", err);
      replyError = err instanceof Error ? err.message : "Failed to submit reply";
    } finally {
      isSubmittingReply = false;
    }
  }

  /**
   * Delete a comment
   */
  async function handleDeleteComment(comment: NDKEvent) {
    if (!canDelete(comment)) return;

    if (!confirm('Are you sure you want to delete this comment?')) {
      return;
    }

    const newDeleting = new Set(deletingComments);
    newDeleting.add(comment.id);
    deletingComments = newDeleting;

    try {
      const result = await deleteEvent({
        eventId: comment.id,
        eventKind: comment.kind,
        reason: 'User deleted comment',
      }, ndk);

      if (result.success) {
        console.log('[SectionComments] Comment deleted successfully');
        // Note: The comment will still show in the UI until the page is refreshed
        // or the parent component refetches comments
      } else {
        alert(`Failed to delete comment: ${result.error}`);
      }
    } catch (err) {
      console.error('[SectionComments] Error deleting comment:', err);
      alert('Failed to delete comment');
    } finally {
      const newDeleting = new Set(deletingComments);
      newDeleting.delete(comment.id);
      deletingComments = newDeleting;
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

<!-- AI-NOTE: Debug info for comment display -->
{#if visible && threadStructure.rootComments.length > 0}
  {console.debug(`[SectionComments] RENDERING: visible=${visible}, rootComments=${threadStructure.rootComments.length}, totalComments=${comments.length}`)}
  <div class="space-y-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg p-4 shadow-lg">
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
                <span class="text-gray-400 dark:text-gray-500">•</span>
                <button
                  class="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors"
                  onclick={(e) => {
                    e.stopPropagation();
                    replyingTo = replyingTo === rootComment.id ? null : rootComment.id;
                    replyError = null;
                    replySuccess = null;
                    // Auto-expand when replying from collapsed view
                    if (!expandedThreads.has(rootComment.id)) {
                      toggleThread(rootComment.id);
                    }
                  }}
                >
                  Reply
                </button>
              </div>
            </div>

            <!-- Actions menu in collapsed view -->
            <div class="flex-shrink-0 mt-1">
              <button
                id="comment-actions-collapsed-{rootComment.id}"
                class="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                aria-label="Comment actions"
                onclick={(e) => { e.stopPropagation(); }}
              >
                <DotsVerticalOutline class="w-4 h-4 text-gray-600 dark:text-gray-400" />
              </button>
              <Popover
                triggeredBy="#comment-actions-collapsed-{rootComment.id}"
                placement="bottom-end"
                class="w-48 text-sm"
              >
                <ul class="space-y-1">
                  <li>
                    <button
                      class="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded flex items-center gap-2"
                      onclick={() => {
                        detailsModalOpen = rootComment.id;
                      }}
                    >
                      <EyeOutline class="w-4 h-4" />
                      View details
                    </button>
                  </li>
                  <li>
                    <button
                      class="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded flex items-center gap-2"
                      onclick={async () => {
                        await copyNevent(rootComment);
                      }}
                    >
                      <ClipboardCleanOutline class="w-4 h-4" />
                      Copy nevent
                    </button>
                  </li>
                  {#if canDelete(rootComment)}
                    <li>
                      <button
                        class="w-full text-left px-3 py-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded flex items-center gap-2 text-red-600 dark:text-red-400"
                        onclick={() => {
                          handleDeleteComment(rootComment);
                        }}
                        disabled={deletingComments.has(rootComment.id)}
                      >
                        <TrashBinOutline class="w-4 h-4" />
                        {deletingComments.has(rootComment.id) ? 'Deleting...' : 'Delete comment'}
                      </button>
                    </li>
                  {/if}
                </ul>
              </Popover>
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

              <!-- Actions menu -->
              <div class="ml-auto">
                <button
                  id="comment-actions-{rootComment.id}"
                  class="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                  aria-label="Comment actions"
                >
                  <DotsVerticalOutline class="w-4 h-4 text-gray-600 dark:text-gray-400" />
                </button>
                <Popover
                  triggeredBy="#comment-actions-{rootComment.id}"
                  placement="bottom-end"
                  class="w-48 text-sm"
                >
                  <ul class="space-y-1">
                    <li>
                      <button
                        class="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded flex items-center gap-2"
                        onclick={() => {
                          detailsModalOpen = rootComment.id;
                        }}
                      >
                        <EyeOutline class="w-4 h-4" />
                        View details
                      </button>
                    </li>
                    <li>
                      <button
                        class="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded flex items-center gap-2"
                        onclick={async () => {
                          await copyNevent(rootComment);
                        }}
                      >
                        <ClipboardCleanOutline class="w-4 h-4" />
                        Copy nevent
                      </button>
                    </li>
                    {#if canDelete(rootComment)}
                      <li>
                        <button
                          class="w-full text-left px-3 py-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded flex items-center gap-2 text-red-600 dark:text-red-400"
                          onclick={() => {
                            handleDeleteComment(rootComment);
                          }}
                          disabled={deletingComments.has(rootComment.id)}
                        >
                          <TrashBinOutline class="w-4 h-4" />
                          {deletingComments.has(rootComment.id) ? 'Deleting...' : 'Delete comment'}
                        </button>
                      </li>
                    {/if}
                  </ul>
                </Popover>
              </div>
            </div>

            <!-- Full content -->
            <div class="px-3 py-3">
              <div class="text-sm text-gray-700 dark:text-gray-300 prose prose-sm dark:prose-invert max-w-none mb-3">
                {@render basicMarkup(rootComment.content)}
              </div>

              <!-- Reply button -->
              <div class="mb-3">
                <Button
                  size="xs"
                  color="light"
                  onclick={() => {
                    replyingTo = replyingTo === rootComment.id ? null : rootComment.id;
                    replyError = null;
                    replySuccess = null;
                  }}
                >
                  {replyingTo === rootComment.id ? 'Cancel Reply' : 'Reply'}
                </Button>
              </div>

              <!-- Reply UI -->
              {#if replyingTo === rootComment.id}
                <div class="mb-4 border border-gray-300 dark:border-gray-600 rounded-lg p-3 bg-gray-50 dark:bg-gray-700">
                  <Textarea
                    bind:value={replyContent}
                    placeholder="Write your reply..."
                    rows={3}
                    disabled={isSubmittingReply}
                    class="mb-2"
                  />

                  {#if replyError}
                    <P class="text-red-600 dark:text-red-400 text-sm mb-2">{replyError}</P>
                  {/if}

                  {#if replySuccess === rootComment.id}
                    <P class="text-green-600 dark:text-green-400 text-sm mb-2">Reply posted successfully!</P>
                  {/if}

                  <div class="flex gap-2">
                    <Button
                      size="sm"
                      onclick={() => submitReply(rootComment)}
                      disabled={isSubmittingReply || !replyContent.trim()}
                    >
                      {isSubmittingReply ? 'Posting...' : 'Post Reply'}
                    </Button>
                    <Button
                      size="sm"
                      color="light"
                      onclick={() => {
                        replyingTo = null;
                        replyContent = "";
                        replyError = null;
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              {/if}

              <!-- Replies -->
              {#if replyCount > 0}
                {console.debug(`[SectionComments] Rendering ${replyCount} replies for comment ${rootComment.id?.substring(0, 8)}`)}
                <div class="pl-4 border-l-2 border-gray-200 dark:border-gray-600 space-y-2">
                  {#each renderReplies(rootComment.id, threadStructure.repliesByParent) as reply (reply.id)}
                    <div class="bg-gray-50 dark:bg-gray-700/30 rounded p-3">
                      <div class="flex items-center gap-2 mb-2">
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

                        <!-- Three-dot menu for reply -->
                        <div class="ml-auto flex items-center gap-2">
                          <button
                            id="reply-actions-{reply.id}"
                            class="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                            aria-label="Reply actions"
                            onclick={(e) => { e.stopPropagation(); }}
                          >
                            <DotsVerticalOutline class="w-3 h-3 text-gray-600 dark:text-gray-400" />
                          </button>
                          <Popover
                            triggeredBy="#reply-actions-{reply.id}"
                            placement="bottom-end"
                            class="w-48 text-sm"
                          >
                            <ul class="space-y-1">
                              <li>
                                <button
                                  class="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded flex items-center gap-2"
                                  onclick={() => {
                                    detailsModalOpen = reply.id;
                                  }}
                                >
                                  <EyeOutline class="w-4 h-4" />
                                  View details
                                </button>
                              </li>
                              <li>
                                <button
                                  class="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded flex items-center gap-2"
                                  onclick={async () => {
                                    await copyNevent(reply);
                                  }}
                                >
                                  <ClipboardCleanOutline class="w-4 h-4" />
                                  Copy nevent
                                </button>
                              </li>
                              {#if canDelete(reply)}
                                <li>
                                  <button
                                    class="w-full text-left px-3 py-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded flex items-center gap-2 text-red-600 dark:text-red-400"
                                    onclick={() => {
                                      handleDeleteComment(reply);
                                    }}
                                    disabled={deletingComments.has(reply.id)}
                                  >
                                    <TrashBinOutline class="w-4 h-4" />
                                    {deletingComments.has(reply.id) ? 'Deleting...' : 'Delete comment'}
                                  </button>
                                </li>
                              {/if}
                            </ul>
                          </Popover>
                        </div>
                      </div>
                      <div class="text-sm text-gray-700 dark:text-gray-300 prose prose-sm dark:prose-invert max-w-none mb-2">
                        {@render basicMarkup(reply.content)}
                      </div>

                      <!-- Reply button for first-level reply -->
                      <div class="mb-2">
                        <Button
                          size="xs"
                          color="light"
                          onclick={() => {
                            replyingTo = replyingTo === reply.id ? null : reply.id;
                            replyError = null;
                            replySuccess = null;
                          }}
                        >
                          {replyingTo === reply.id ? 'Cancel Reply' : 'Reply'}
                        </Button>
                      </div>

                      <!-- Reply UI for first-level reply -->
                      {#if replyingTo === reply.id}
                        <div class="mb-3 border border-gray-300 dark:border-gray-600 rounded-lg p-3 bg-white dark:bg-gray-800">
                          <Textarea
                            bind:value={replyContent}
                            placeholder="Write your reply..."
                            rows={3}
                            disabled={isSubmittingReply}
                            class="mb-2"
                          />

                          {#if replyError}
                            <P class="text-red-600 dark:text-red-400 text-sm mb-2">{replyError}</P>
                          {/if}

                          {#if replySuccess === reply.id}
                            <P class="text-green-600 dark:text-green-400 text-sm mb-2">Reply posted successfully!</P>
                          {/if}

                          <div class="flex gap-2">
                            <Button
                              size="sm"
                              onclick={() => submitReply(reply)}
                              disabled={isSubmittingReply || !replyContent.trim()}
                            >
                              {isSubmittingReply ? 'Posting...' : 'Post Reply'}
                            </Button>
                            <Button
                              size="sm"
                              color="light"
                              onclick={() => {
                                replyingTo = null;
                                replyContent = "";
                                replyError = null;
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      {/if}

                      <!-- Nested replies (one level deep) -->
                      {#each renderReplies(reply.id, threadStructure.repliesByParent) as nestedReply (nestedReply.id)}
                        <div class="ml-4 mt-2 bg-gray-100 dark:bg-gray-600/30 rounded p-2">
                          <div class="flex items-center gap-2 mb-1">
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

                            <!-- Three-dot menu for nested reply -->
                            <div class="ml-auto flex items-center gap-2">
                              <button
                                id="nested-reply-actions-{nestedReply.id}"
                                class="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                                aria-label="Nested reply actions"
                                onclick={(e) => { e.stopPropagation(); }}
                              >
                                <DotsVerticalOutline class="w-3 h-3 text-gray-600 dark:text-gray-400" />
                              </button>
                              <Popover
                                triggeredBy="#nested-reply-actions-{nestedReply.id}"
                                placement="bottom-end"
                                class="w-48 text-sm"
                              >
                                <ul class="space-y-1">
                                  <li>
                                    <button
                                      class="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded flex items-center gap-2"
                                      onclick={() => {
                                        detailsModalOpen = nestedReply.id;
                                      }}
                                    >
                                      <EyeOutline class="w-4 h-4" />
                                      View details
                                    </button>
                                  </li>
                                  <li>
                                    <button
                                      class="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded flex items-center gap-2"
                                      onclick={async () => {
                                        await copyNevent(nestedReply);
                                      }}
                                    >
                                      <ClipboardCleanOutline class="w-4 h-4" />
                                      Copy nevent
                                    </button>
                                  </li>
                                  {#if canDelete(nestedReply)}
                                    <li>
                                      <button
                                        class="w-full text-left px-3 py-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded flex items-center gap-2 text-red-600 dark:text-red-400"
                                        onclick={() => {
                                          handleDeleteComment(nestedReply);
                                        }}
                                        disabled={deletingComments.has(nestedReply.id)}
                                      >
                                        <TrashBinOutline class="w-4 h-4" />
                                        {deletingComments.has(nestedReply.id) ? 'Deleting...' : 'Delete comment'}
                                      </button>
                                    </li>
                                  {/if}
                                </ul>
                              </Popover>
                            </div>
                          </div>
                          <div class="text-xs text-gray-700 dark:text-gray-300 mb-2">
                            {@render basicMarkup(nestedReply.content)}
                          </div>

                          <!-- Reply button for nested reply -->
                          <div class="mb-1">
                            <Button
                              size="xs"
                              color="light"
                              onclick={() => {
                                replyingTo = replyingTo === nestedReply.id ? null : nestedReply.id;
                                replyError = null;
                                replySuccess = null;
                              }}
                            >
                              {replyingTo === nestedReply.id ? 'Cancel Reply' : 'Reply'}
                            </Button>
                          </div>

                          <!-- Reply UI for nested reply -->
                          {#if replyingTo === nestedReply.id}
                            <div class="mb-2 border border-gray-300 dark:border-gray-600 rounded-lg p-2 bg-white dark:bg-gray-800">
                              <Textarea
                                bind:value={replyContent}
                                placeholder="Write your reply..."
                                rows={2}
                                disabled={isSubmittingReply}
                                class="mb-2 text-xs"
                              />

                              {#if replyError}
                                <P class="text-red-600 dark:text-red-400 text-xs mb-1">{replyError}</P>
                              {/if}

                              {#if replySuccess === nestedReply.id}
                                <P class="text-green-600 dark:text-green-400 text-xs mb-1">Reply posted successfully!</P>
                              {/if}

                              <div class="flex gap-2">
                                <Button
                                  size="xs"
                                  onclick={() => submitReply(nestedReply)}
                                  disabled={isSubmittingReply || !replyContent.trim()}
                                >
                                  {isSubmittingReply ? 'Posting...' : 'Post Reply'}
                                </Button>
                                <Button
                                  size="xs"
                                  color="light"
                                  onclick={() => {
                                    replyingTo = null;
                                    replyContent = "";
                                    replyError = null;
                                  }}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          {/if}
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

<!-- Details Modal -->
{#if detailsModalOpen}
  {@const comment = comments.find(c => c.id === detailsModalOpen)}
  {#if comment}
    <Modal
      title="Comment Details"
      open={true}
      autoclose
      outsideclose
      size="lg"
      class="modal-leather"
      onclose={() => detailsModalOpen = null}
    >
      <div class="space-y-4">
        <div class="flex justify-center pb-2">
          <Button
            color="primary"
            onclick={() => {
              viewEventDetails(comment);
            }}
          >
            View on Event Page
          </Button>
        </div>
        <div>
          <pre class="text-xs bg-gray-100 dark:bg-gray-800 p-3 rounded overflow-x-auto max-h-[500px] overflow-y-auto">{JSON.stringify({
            id: comment.id,
            pubkey: comment.pubkey,
            created_at: comment.created_at,
            kind: comment.kind,
            tags: comment.tags,
            content: comment.content,
            sig: comment.sig
          }, null, 2)}</pre>
        </div>
      </div>
    </Modal>
  {/if}
{/if}

<style>
  /* Ensure proper text wrapping */
  .prose {
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
</style>