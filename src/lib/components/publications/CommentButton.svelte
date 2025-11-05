<script lang="ts">
  import { Button, Textarea, P } from "flowbite-svelte";
  import { getContext } from "svelte";
  import type NDK from "@nostr-dev-kit/ndk";
  import { NDKEvent } from "@nostr-dev-kit/ndk";
  import { userStore } from "$lib/stores/userStore";
  import { activeOutboxRelays } from "$lib/ndk";

  let {
    address,
    onCommentPosted,
  }: {
    address: string;
    onCommentPosted?: () => void;
  } = $props();

  const ndk: NDK = getContext("ndk");

  // State management
  let showCommentUI = $state(false);
  let commentContent = $state("");
  let isSubmitting = $state(false);
  let error = $state<string | null>(null);
  let success = $state(false);
  let sectionHovered = $state(false);

  // Parse address to get event details
  function parseAddress(address: string): { kind: number; pubkey: string; dTag: string } | null {
    const parts = address.split(":");
    if (parts.length !== 3) {
      console.error("[CommentButton] Invalid address format:", address);
      return null;
    }

    const [kindStr, pubkey, dTag] = parts;
    const kind = parseInt(kindStr);

    if (isNaN(kind)) {
      console.error("[CommentButton] Invalid kind in address:", kindStr);
      return null;
    }

    return { kind, pubkey, dTag };
  }

  // Create NIP-22 comment event
  async function createCommentEvent(content: string): Promise<NDKEvent | null> {
    const eventDetails = parseAddress(address);
    if (!eventDetails) {
      error = "Invalid event address";
      return null;
    }

    const { kind, pubkey: authorPubkey, dTag } = eventDetails;

    // Get relay hint (use first available outbox relay)
    const relayHint = $activeOutboxRelays[0] || "";

    // Get the actual event to include its ID in tags
    let eventId = "";
    try {
      const targetEvent = await ndk.fetchEvent({
        kinds: [kind],
        authors: [authorPubkey],
        "#d": [dTag],
      });

      if (targetEvent) {
        eventId = targetEvent.id;
      }
    } catch (err) {
      console.warn("[CommentButton] Could not fetch target event ID:", err);
    }

    // Create the comment event following NIP-22 structure
    const commentEvent = new NDKEvent(ndk);
    commentEvent.kind = 1111;
    commentEvent.content = content;

    // NIP-22 tags structure for top-level comments
    commentEvent.tags = [
      // Root scope - uppercase tags
      ["A", address, relayHint, authorPubkey],
      ["K", kind.toString()],
      ["P", authorPubkey, relayHint],

      // Parent scope (same as root for top-level) - lowercase tags
      ["a", address, relayHint],
      ["k", kind.toString()],
      ["p", authorPubkey, relayHint],
    ];

    // Include e tag if we have the event ID
    if (eventId) {
      commentEvent.tags.push(["e", eventId, relayHint]);
    }

    console.log("[CommentButton] Created NIP-22 comment event:", {
      kind: commentEvent.kind,
      tags: commentEvent.tags,
      content: commentEvent.content,
    });

    return commentEvent;
  }

  // Submit comment
  async function submitComment() {
    if (!commentContent.trim()) {
      error = "Comment cannot be empty";
      return;
    }

    if (!$userStore.signedIn || !$userStore.signer) {
      error = "You must be signed in to comment";
      return;
    }

    isSubmitting = true;
    error = null;
    success = false;

    try {
      const commentEvent = await createCommentEvent(commentContent);
      if (!commentEvent) {
        throw new Error("Failed to create comment event");
      }

      // Sign the event
      await commentEvent.sign($userStore.signer);

      console.log("[CommentButton] Signed comment event:", commentEvent.rawEvent());

      // Publish to relays
      const publishedRelays = await commentEvent.publish();

      console.log("[CommentButton] Published to relays:", publishedRelays);

      if (publishedRelays.size === 0) {
        throw new Error("Failed to publish to any relays");
      }

      // Success!
      success = true;
      commentContent = "";

      // Close UI after a delay
      setTimeout(() => {
        showCommentUI = false;
        success = false;

        // Trigger refresh of CommentViewer if callback provided
        if (onCommentPosted) {
          onCommentPosted();
        }
      }, 2000);

    } catch (err) {
      console.error("[CommentButton] Error submitting comment:", err);
      error = err instanceof Error ? err.message : "Failed to post comment";
    } finally {
      isSubmitting = false;
    }
  }

  // Cancel comment
  function cancelComment() {
    showCommentUI = false;
    commentContent = "";
    error = null;
    success = false;
  }

  // Toggle comment UI
  function toggleCommentUI() {
    if (!$userStore.signedIn) {
      error = "You must be signed in to comment";
      setTimeout(() => {
        error = null;
      }, 3000);
      return;
    }

    showCommentUI = !showCommentUI;
    error = null;
    success = false;
  }
</script>

<!-- Hamburger Comment Button -->
<div class="comment-button-container" onmouseenter={() => sectionHovered = true} onmouseleave={() => sectionHovered = false}>
  <button
    class="hamburger-button"
    class:visible={sectionHovered || showCommentUI}
    onclick={toggleCommentUI}
    title="Add comment"
    aria-label="Add comment"
  >
    <span class="line"></span>
    <span class="line"></span>
    <span class="line"></span>
  </button>

  <!-- Comment Creation UI -->
  {#if showCommentUI}
    <div class="comment-ui">
      <div class="comment-header">
        <h4>Add Comment</h4>
        {#if $userStore.profile}
          <div class="user-info">
            {#if $userStore.profile.picture}
              <img src={$userStore.profile.picture} alt={$userStore.profile.displayName || $userStore.profile.name || "User"} class="user-avatar" />
            {/if}
            <span class="user-name">{$userStore.profile.displayName || $userStore.profile.name || "Anonymous"}</span>
          </div>
        {/if}
      </div>

      <Textarea
        bind:value={commentContent}
        placeholder="Write your comment here..."
        rows={4}
        disabled={isSubmitting}
        class="comment-textarea"
      />

      {#if error}
        <P class="error-message text-red-600 dark:text-red-400 text-sm mt-2">{error}</P>
      {/if}

      {#if success}
        <P class="success-message text-green-600 dark:text-green-400 text-sm mt-2">Comment posted successfully!</P>
      {/if}

      <div class="comment-actions">
        <Button
          size="sm"
          color="alternative"
          onclick={cancelComment}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          onclick={submitComment}
          disabled={isSubmitting || !commentContent.trim()}
        >
          {isSubmitting ? "Posting..." : "Post Comment"}
        </Button>
      </div>
    </div>
  {/if}
</div>

<style>
  .comment-button-container {
    position: relative;
  }

  .hamburger-button {
    position: absolute;
    top: 0;
    left: 0;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    width: 28px;
    height: 20px;
    padding: 4px;
    background: transparent;
    border: none;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.2s ease-in-out;
    z-index: 10;
  }

  .hamburger-button.visible {
    opacity: 1;
  }

  .hamburger-button:hover .line {
    border-width: 2px;
    margin: 1px 0;
  }

  .line {
    width: 100%;
    border-top: 1px dashed #6b7280;
    transition: all 0.2s ease-in-out;
    margin: 2px 0;
  }

  .comment-ui {
    position: absolute;
    top: 30px;
    left: 0;
    min-width: 400px;
    max-width: 600px;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 16px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    z-index: 20;
  }

  :global(.dark) .comment-ui {
    background: #1f2937;
    border-color: #374151;
  }

  .comment-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .comment-header h4 {
    font-size: 16px;
    font-weight: 600;
    margin: 0;
    color: #111827;
  }

  :global(.dark) .comment-header h4 {
    color: #f9fafb;
  }

  .user-info {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .user-avatar {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    object-fit: cover;
  }

  .user-name {
    font-size: 14px;
    color: #6b7280;
  }

  :global(.dark) .user-name {
    color: #9ca3af;
  }

  .comment-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 12px;
  }

  /* Make the comment UI responsive */
  @media (max-width: 640px) {
    .comment-ui {
      min-width: 280px;
      max-width: calc(100vw - 32px);
      left: -8px;
    }
  }
</style>
