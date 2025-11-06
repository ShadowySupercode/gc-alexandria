<script lang="ts">
  import { Button, Textarea, P } from "flowbite-svelte";
  import { getContext } from "svelte";
  import type NDK from "@nostr-dev-kit/ndk";
  import { NDKEvent } from "@nostr-dev-kit/ndk";
  import { userStore } from "$lib/stores/userStore";
  import { activeOutboxRelays, activeInboxRelays } from "$lib/ndk";
  import { communityRelays } from "$lib/consts";
  import { WebSocketPool } from "$lib/data_structures/websocket_pool";
  import { ChevronDownOutline, ChevronUpOutline } from "flowbite-svelte-icons";

  let {
    address,
    onCommentPosted,
    inline = false,
  }: {
    address: string;
    onCommentPosted?: () => void;
    inline?: boolean;
  } = $props();

  const ndk: NDK = getContext("ndk");

  // State management
  let showCommentUI = $state(false);
  let commentContent = $state("");
  let isSubmitting = $state(false);
  let error = $state<string | null>(null);
  let success = $state(false);
  let showJsonPreview = $state(false);

  // Build preview JSON for the comment event
  let previewJson = $derived.by(() => {
    if (!commentContent.trim()) return null;

    const eventDetails = parseAddress(address);
    if (!eventDetails) return null;

    const { kind, pubkey: authorPubkey, dTag } = eventDetails;
    const relayHint = $activeOutboxRelays[0] || "";

    return {
      kind: 1111,
      pubkey: $userStore.pubkey || "<your-pubkey>",
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["A", address, relayHint, authorPubkey],
        ["K", kind.toString()],
        ["P", authorPubkey, relayHint],
        ["a", address, relayHint],
        ["k", kind.toString()],
        ["p", authorPubkey, relayHint],
      ],
      content: commentContent,
      id: "<calculated-on-signing>",
      sig: "<calculated-on-signing>"
    };
  });

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
    commentEvent.pubkey = $userStore.pubkey || ""; // Set pubkey from user store

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

      // Sign the event - create plain object to avoid proxy issues
      const plainEvent = {
        kind: Number(commentEvent.kind),
        pubkey: String(commentEvent.pubkey),
        created_at: Number(commentEvent.created_at ?? Math.floor(Date.now() / 1000)),
        tags: commentEvent.tags.map((tag) => tag.map(String)),
        content: String(commentEvent.content),
      };

      if (typeof window !== "undefined" && window.nostr && window.nostr.signEvent) {
        const signed = await window.nostr.signEvent(plainEvent);
        commentEvent.sig = signed.sig;
        if ("id" in signed) {
          commentEvent.id = signed.id as string;
        }
      } else {
        await commentEvent.sign($userStore.signer);
      }

      console.log("[CommentButton] Signed comment event:", commentEvent.rawEvent());

      // Build relay list following the same pattern as eventServices
      const relays = [
        ...communityRelays,
        ...$activeOutboxRelays,
        ...$activeInboxRelays,
      ];

      // Remove duplicates
      const uniqueRelays = Array.from(new Set(relays));

      console.log("[CommentButton] Publishing to relays:", uniqueRelays);

      const signedEvent = {
        ...plainEvent,
        id: commentEvent.id,
        sig: commentEvent.sig,
      };

      // Publish to relays using WebSocketPool
      let publishedCount = 0;
      for (const relayUrl of uniqueRelays) {
        try {
          const ws = await WebSocketPool.instance.acquire(relayUrl);

          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              WebSocketPool.instance.release(ws);
              reject(new Error("Timeout"));
            }, 5000);

            ws.onmessage = (e) => {
              const [type, id, ok, message] = JSON.parse(e.data);
              if (type === "OK" && id === signedEvent.id) {
                clearTimeout(timeout);
                if (ok) {
                  publishedCount++;
                  console.log(`[CommentButton] Published to ${relayUrl}`);
                  WebSocketPool.instance.release(ws);
                  resolve();
                } else {
                  console.warn(`[CommentButton] ${relayUrl} rejected: ${message}`);
                  WebSocketPool.instance.release(ws);
                  reject(new Error(message));
                }
              }
            };

            // Send the event to the relay
            ws.send(JSON.stringify(["EVENT", signedEvent]));
          });
        } catch (e) {
          console.error(`[CommentButton] Failed to publish to ${relayUrl}:`, e);
        }
      }

      if (publishedCount === 0) {
        throw new Error("Failed to publish to any relays");
      }

      console.log(`[CommentButton] Published to ${publishedCount} relay(s)`);

      // Success!
      success = true;
      commentContent = "";
      showJsonPreview = false;

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
    showJsonPreview = false;
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
    showJsonPreview = false;
  }
</script>

<!-- Hamburger Comment Button -->
<div class="comment-button-container" class:inline={inline}>
  <button
    class="single-line-button"
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

      <!-- JSON Preview Section -->
      {#if showJsonPreview && previewJson}
        <div class="border border-gray-300 dark:border-gray-600 rounded-lg p-3 bg-gray-50 dark:bg-gray-900 mt-3">
          <P class="text-sm font-semibold mb-2">Event JSON Preview:</P>
          <pre class="text-xs bg-white dark:bg-gray-800 p-3 rounded overflow-x-auto border border-gray-200 dark:border-gray-700"><code>{JSON.stringify(previewJson, null, 2)}</code></pre>
        </div>
      {/if}

      <div class="comment-actions-wrapper">
        <Button
          color="light"
          size="sm"
          onclick={() => showJsonPreview = !showJsonPreview}
          class="flex items-center gap-1"
        >
          {#if showJsonPreview}
            <ChevronUpOutline class="w-4 h-4" />
          {:else}
            <ChevronDownOutline class="w-4 h-4" />
          {/if}
          {showJsonPreview ? "Hide" : "Show"} JSON
        </Button>

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
    </div>
  {/if}
</div>

<style>
  .comment-button-container {
    position: absolute;
    top: 0;
    right: 0;
    left: 0;
    height: 0;
    pointer-events: none;
  }

  .comment-button-container.inline {
    position: relative;
    height: auto;
    pointer-events: auto;
  }

  .single-line-button {
    position: absolute;
    top: 4px;
    right: 8px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    width: 24px;
    height: 18px;
    padding: 4px;
    background: transparent;
    border: none;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.2s ease-in-out;
    z-index: 10;
    pointer-events: auto;
  }

  .comment-button-container.inline .single-line-button {
    position: relative;
    top: 0;
    right: 0;
    opacity: 1;
  }

  .single-line-button:hover .line {
    border-width: 3px;
  }

  .line {
    display: block;
    width: 100%;
    height: 0;
    border: none;
    border-top: 2px dashed #6b7280;
    transition: all 0.2s ease-in-out;
  }

  .comment-ui {
    position: absolute;
    top: 35px;
    right: 8px;
    min-width: 400px;
    max-width: 600px;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 16px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    z-index: 20;
    pointer-events: auto;
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

  .comment-actions-wrapper {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 12px;
  }

  .comment-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  /* Make the comment UI responsive */
  @media (max-width: 640px) {
    .comment-ui {
      min-width: 280px;
      max-width: calc(100vw - 32px);
      right: -8px;
    }
  }
</style>
