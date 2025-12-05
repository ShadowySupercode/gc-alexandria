<script lang="ts">
  import { Button, Modal, Popover, Textarea, P } from "flowbite-svelte";
  import {
    DotsVerticalOutline,
    EyeOutline,
    ClipboardCleanOutline,
    TrashBinOutline,
    MessageDotsOutline,
    ChevronDownOutline,
    ChevronUpOutline,
  } from "flowbite-svelte-icons";
  import CopyToClipboard from "$components/util/CopyToClipboard.svelte";
  import { userBadge } from "$lib/snippets/UserSnippets.svelte";
  import { neventEncode, naddrEncode } from "$lib/utils";
  import {
    activeInboxRelays,
    activeOutboxRelays,
    getNdkContext,
  } from "$lib/ndk";
  import { userStore } from "$lib/stores/userStore";
  import { goto } from "$app/navigation";
  import type { NDKEvent } from "$lib/utils/nostrUtils";
  import { NDKEvent as NDKEventClass } from "@nostr-dev-kit/ndk";
  import LazyImage from "$components/util/LazyImage.svelte";
  import { communityRelays } from "$lib/consts";
  import { WebSocketPool } from "$lib/data_structures/websocket_pool";

  // Component props
  let { event, onDelete, sectionAddress } = $props<{
    event: NDKEvent;
    onDelete?: () => void;
    sectionAddress?: string; // If provided, shows "Comment on section" option
  }>();

  const ndk = getNdkContext();

  // Subscribe to userStore (Svelte 5 runes pattern)
  let user = $derived($userStore);

  // Derive metadata from event
  let title = $derived(
    event.tags.find((t: string[]) => t[0] === "title")?.[1] ?? "",
  );
  let summary = $derived(
    event.tags.find((t: string[]) => t[0] === "summary")?.[1] ?? "",
  );
  let image = $derived(
    event.tags.find((t: string[]) => t[0] === "image")?.[1] ?? null,
  );
  let author = $derived(
    event.tags.find((t: string[]) => t[0] === "author")?.[1] ?? "",
  );
  let originalAuthor = $derived(
    event.tags.find((t: string[]) => t[0] === "original_author")?.[1] ?? null,
  );
  let version = $derived(
    event.tags.find((t: string[]) => t[0] === "version")?.[1] ?? "",
  );
  let source = $derived(
    event.tags.find((t: string[]) => t[0] === "source")?.[1] ?? null,
  );
  let type = $derived(
    event.tags.find((t: string[]) => t[0] === "type")?.[1] ?? null,
  );
  let language = $derived(
    event.tags.find((t: string[]) => t[0] === "language")?.[1] ?? null,
  );
  let publisher = $derived(
    event.tags.find((t: string[]) => t[0] === "publisher")?.[1] ?? null,
  );
  let identifier = $derived(
    event.tags.find((t: string[]) => t[0] === "identifier")?.[1] ?? null,
  );

  // UI state
  let detailsModalOpen: boolean = $state(false);
  let isOpen: boolean = $state(false);

  // Comment modal state
  let commentModalOpen: boolean = $state(false);
  let commentContent: string = $state("");
  let isSubmittingComment: boolean = $state(false);
  let commentError: string | null = $state(null);
  let commentSuccess: boolean = $state(false);
  let showJsonPreview: boolean = $state(false);

  // Build preview JSON for the comment event
  let previewJson = $derived.by(() => {
    if (!commentContent.trim() || !sectionAddress) return null;

    const eventDetails = parseAddress(sectionAddress);
    if (!eventDetails) return null;

    const { kind, pubkey: authorPubkey, dTag } = eventDetails;
    const relayHint = $activeOutboxRelays[0] || "";

    return {
      kind: 1111,
      pubkey: user.pubkey || "<your-pubkey>",
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["A", sectionAddress, relayHint, authorPubkey],
        ["K", kind.toString()],
        ["P", authorPubkey, relayHint],
        ["a", sectionAddress, relayHint],
        ["k", kind.toString()],
        ["p", authorPubkey, relayHint],
      ],
      content: commentContent,
      id: "<calculated-on-signing>",
      sig: "<calculated-on-signing>",
    };
  });

  // Check if user can delete this event (must be the author)
  let canDelete = $derived.by(() => {
    const result =
      user.signedIn && user.pubkey === event.pubkey && onDelete !== undefined;
    console.log("[CardActions] canDelete check:", {
      userSignedIn: user.signedIn,
      userPubkey: user.pubkey,
      eventPubkey: event.pubkey,
      onDeleteProvided: onDelete !== undefined,
      canDelete: result,
    });
    return result;
  });

  // Determine delete button text based on event kind
  let deleteButtonText = $derived.by(() => {
    if (event.kind === 30040) {
      // Kind 30040 is an index/publication
      return "Delete publication";
    } else if (event.kind === 30041) {
      // Kind 30041 is a section
      return "Delete section";
    } else if (event.kind === 30023) {
      // Kind 30023 is a long-form article
      return "Delete article";
    } else {
      return "Delete";
    }
  });

  /**
   * Selects the appropriate relay set based on user state and feed type
   * - Uses active inbox relays from the new relay management system
   * - Falls back to active inbox relays for anonymous users (which include community relays)
   */
  let activeRelays = $derived(
    (() => {
      const relays = user.signedIn ? $activeInboxRelays : $activeInboxRelays;

      console.debug("[CardActions] Selected relays:", {
        eventId: event.id,
        isSignedIn: user.signedIn,
        relayCount: relays.length,
        relayUrls: relays,
      });

      return relays;
    })(),
  );

  /**
   * Opens the actions popover menu
   */
  function openPopover() {
    isOpen = true;
  }

  /**
   * Closes the actions popover menu and removes focus
   */
  function closePopover() {
    isOpen = false;
    const menu = document.getElementById("dots-" + event.id);
    if (menu) menu.blur();
  }

  /**
   * Gets the appropriate identifier (nevent or naddr) for copying
   * @param type - The type of identifier to get ('nevent' or 'naddr')
   * @returns The encoded identifier string
   */
  function getIdentifier(type: "nevent" | "naddr"): string {
    const encodeFn = type === "nevent" ? neventEncode : naddrEncode;
    const identifier = encodeFn(event, activeRelays);
    return identifier;
  }

  /**
   * Opens the event details modal
   */
  function viewDetails() {
    detailsModalOpen = true;
  }

  /**
   * Navigates to the event details page
   */
  function viewEventDetails() {
    const nevent = getIdentifier("nevent");
    goto(`/events?id=${encodeURIComponent(nevent)}`);
  }

  /**
   * Opens the comment modal
   */
  function openCommentModal() {
    if (!user.signedIn) {
      commentError = "You must be signed in to comment";
      setTimeout(() => {
        commentError = null;
      }, 3000);
      return;
    }
    closePopover();
    commentModalOpen = true;
    commentContent = "";
    commentError = null;
    commentSuccess = false;
    showJsonPreview = false;
  }

  /**
   * Parse address to get event details
   */
  function parseAddress(
    address: string,
  ): { kind: number; pubkey: string; dTag: string } | null {
    const parts = address.split(":");
    if (parts.length !== 3) {
      console.error("[CardActions] Invalid address format:", address);
      return null;
    }

    const [kindStr, pubkey, dTag] = parts;
    const kind = parseInt(kindStr);

    if (isNaN(kind)) {
      console.error("[CardActions] Invalid kind in address:", kindStr);
      return null;
    }

    return { kind, pubkey, dTag };
  }

  /**
   * Submit comment
   */
  async function submitComment() {
    if (!sectionAddress || !user.pubkey) {
      commentError = "Invalid state - cannot submit comment";
      return;
    }

    const eventDetails = parseAddress(sectionAddress);
    if (!eventDetails) {
      commentError = "Invalid event address";
      return;
    }

    const { kind, pubkey: authorPubkey, dTag } = eventDetails;

    isSubmittingComment = true;
    commentError = null;

    try {
      // Get relay hint
      const relayHint = $activeOutboxRelays[0] || "";

      // Fetch target event to get its ID
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
        console.warn("[CardActions] Could not fetch target event ID:", err);
      }

      // Create comment event (NIP-22)
      const commentEvent = new NDKEventClass(ndk);
      commentEvent.kind = 1111;
      commentEvent.content = commentContent;
      commentEvent.pubkey = user.pubkey;

      commentEvent.tags = [
        ["A", sectionAddress, relayHint, authorPubkey],
        ["K", kind.toString()],
        ["P", authorPubkey, relayHint],
        ["a", sectionAddress, relayHint],
        ["k", kind.toString()],
        ["p", authorPubkey, relayHint],
      ];

      if (eventId) {
        commentEvent.tags.push(["e", eventId, relayHint]);
      }

      // Sign event
      const plainEvent = {
        kind: Number(commentEvent.kind),
        pubkey: String(commentEvent.pubkey),
        created_at: Number(
          commentEvent.created_at ?? Math.floor(Date.now() / 1000),
        ),
        tags: commentEvent.tags.map((tag) => tag.map(String)),
        content: String(commentEvent.content),
      };

      if (
        typeof window !== "undefined" &&
        window.nostr &&
        window.nostr.signEvent
      ) {
        const signed = await window.nostr.signEvent(plainEvent);
        commentEvent.sig = signed.sig;
        if ("id" in signed) {
          commentEvent.id = signed.id as string;
        }
      } else if (user.signer) {
        await commentEvent.sign(user.signer);
      }

      // Publish to relays
      const relays = [
        ...communityRelays,
        ...$activeOutboxRelays,
        ...$activeInboxRelays,
      ];
      const uniqueRelays = Array.from(new Set(relays));

      const signedEvent = {
        ...plainEvent,
        id: commentEvent.id,
        sig: commentEvent.sig,
      };

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
                  WebSocketPool.instance.release(ws);
                  resolve();
                } else {
                  WebSocketPool.instance.release(ws);
                  reject(new Error(message));
                }
              }
            };

            ws.send(JSON.stringify(["EVENT", signedEvent]));
          });
        } catch (e) {
          console.error(`[CardActions] Failed to publish to ${relayUrl}:`, e);
        }
      }

      if (publishedCount === 0) {
        throw new Error("Failed to publish to any relays");
      }

      commentSuccess = true;
      setTimeout(() => {
        commentModalOpen = false;
        commentSuccess = false;
        commentContent = "";
        showJsonPreview = false;
      }, 2000);
    } catch (err) {
      console.error("[CardActions] Error submitting comment:", err);
      commentError =
        err instanceof Error ? err.message : "Failed to post comment";
    } finally {
      isSubmittingComment = false;
    }
  }

  /**
   * Cancel comment
   */
  function cancelComment() {
    commentModalOpen = false;
    commentContent = "";
    commentError = null;
    commentSuccess = false;
    showJsonPreview = false;
  }
</script>

<div
  class="group bg-highlight dark:bg-primary-1000 rounded"
  role="group"
  onmouseenter={openPopover}
>
  <!-- Main button -->
  <Button
    type="button"
    id="dots-{event.id}"
    class=" hover:bg-primary-50 dark:text-highlight dark:hover:bg-primary-800 p-1 dots"
    color="primary"
    data-popover-target="popover-actions"
  >
    <DotsVerticalOutline class="h-6 w-6" />
    <span class="sr-only">Open actions menu</span>
  </Button>

  {#if isOpen}
    <Popover
      id="popover-actions"
      placement="bottom"
      trigger="click"
      class="popover-leather w-fit z-10"
      onmouseleave={closePopover}
    >
      <div class="flex flex-row justify-between space-x-4">
        <div class="flex flex-col text-nowrap">
          <ul class="space-y-2">
            {#if sectionAddress}
              <li>
                <button
                  class="btn-leather w-full text-left"
                  onclick={openCommentModal}
                >
                  <MessageDotsOutline class="inline mr-2" /> Comment on section
                </button>
              </li>
            {/if}
            <li>
              <button
                class="btn-leather w-full text-left"
                onclick={viewDetails}
              >
                <EyeOutline class="inline mr-2" /> View details
              </button>
            </li>
            <li>
              <CopyToClipboard
                displayText="Copy naddr address"
                copyText={getIdentifier("naddr")}
                icon={ClipboardCleanOutline}
              />
            </li>
            <li>
              <CopyToClipboard
                displayText="Copy nevent address"
                copyText={getIdentifier("nevent")}
                icon={ClipboardCleanOutline}
              />
            </li>
            {#if canDelete}
              <li>
                <button
                  class="btn-leather w-full text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                  onclick={() => {
                    closePopover();
                    onDelete?.();
                  }}
                >
                  <TrashBinOutline class="inline mr-2" />
                  {deleteButtonText}
                </button>
              </li>
            {/if}
          </ul>
        </div>
      </div>
    </Popover>
  {/if}
  <!-- Event details -->
  <Modal
    class="modal-leather"
    title="Publication details"
    bind:open={detailsModalOpen}
    autoclose
    outsideclose
    size="sm"
  >
    <div class="flex flex-row space-x-4">
      {#if image}
        <div
          class="flex col justify-center align-middle h-32 w-24 min-w-20 max-w-24 overflow-hidden"
        >
          <LazyImage
            src={image}
            alt="Publication cover"
            eventId={event.id}
            className="rounded w-full h-full object-cover"
          />
        </div>
      {/if}
      <div class="flex flex-col col space-y-5 justify-center align-middle">
        <h1 class="text-3xl font-bold mt-0">{title || "Untitled"}</h1>
        <h2 class="text-base font-bold">
          by
          {#if originalAuthor}
            {@render userBadge(originalAuthor, author, ndk)}
          {:else}
            {author || "Unknown"}
          {/if}
        </h2>
        {#if version}
          <h4
            class="text-base font-medium text-primary-700 dark:text-primary-300 mt-2"
          >
            Version: {version}
          </h4>
        {/if}
      </div>
    </div>

    {#if summary}
      <div class="flex flex-row">
        <p class="text-base text-primary-900 dark:text-highlight">{summary}</p>
      </div>
    {/if}

    <div class="flex flex-row">
      <h4 class="text-base font-normal mt-2">
        Index author: {@render userBadge(event.pubkey, author, ndk)}
      </h4>
    </div>

    <div class="flex flex-col pb-4 space-y-1">
      {#if source}
        <h5 class="text-sm">
          Source: <a
            class="underline"
            href={source}
            target="_blank"
            rel="noopener noreferrer">{source}</a
          >
        </h5>
      {/if}
      {#if type}
        <h5 class="text-sm">Publication type: {type}</h5>
      {/if}
      {#if language}
        <h5 class="text-sm">Language: {language}</h5>
      {/if}
      {#if publisher}
        <h5 class="text-sm">Published by: {publisher}</h5>
      {/if}
      {#if identifier}
        <h5 class="text-sm">Identifier: {identifier}</h5>
      {/if}
      <button
        class="mt-4 btn-leather text-center text-primary-700 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300 font-semibold"
        onclick={viewEventDetails}
      >
        View Event Details
      </button>
    </div>
  </Modal>

  <!-- Comment Modal -->
  {#if sectionAddress}
    <Modal
      class="modal-leather"
      title="Add Comment"
      bind:open={commentModalOpen}
      autoclose={false}
      outsideclose={true}
      size="md"
    >
      <div class="space-y-4">
        {#if user.profile}
          <div
            class="flex items-center gap-3 pb-3 border-b border-gray-200 dark:border-gray-700"
          >
            {#if user.profile.picture}
              <img
                src={user.profile.picture}
                alt={user.profile.displayName || user.profile.name || "User"}
                class="w-10 h-10 rounded-full object-cover"
              />
            {/if}
            <span class="font-medium text-gray-900 dark:text-gray-100">
              {user.profile.displayName || user.profile.name || "Anonymous"}
            </span>
          </div>
        {/if}

        <Textarea
          bind:value={commentContent}
          placeholder="Write your comment here..."
          rows={6}
          disabled={isSubmittingComment}
          class="w-full"
        />

        {#if commentError}
          <P class="text-red-600 dark:text-red-400 text-sm">{commentError}</P>
        {/if}

        {#if commentSuccess}
          <P class="text-green-600 dark:text-green-400 text-sm"
            >Comment posted successfully!</P
          >
        {/if}

        <!-- JSON Preview Section -->
        {#if showJsonPreview && previewJson}
          <div
            class="border border-gray-300 dark:border-gray-600 rounded-lg p-3 bg-gray-50 dark:bg-gray-900"
          >
            <P class="text-sm font-semibold mb-2">Event JSON Preview:</P>
            <pre
              class="text-xs bg-white dark:bg-gray-800 p-3 rounded overflow-x-auto border border-gray-200 dark:border-gray-700"><code
                >{JSON.stringify(previewJson, null, 2)}</code
              ></pre>
          </div>
        {/if}

        <div class="flex justify-between items-center gap-3 pt-2">
          <Button
            color="light"
            size="sm"
            onclick={() => (showJsonPreview = !showJsonPreview)}
            class="flex items-center gap-1"
          >
            {#if showJsonPreview}
              <ChevronUpOutline class="w-4 h-4" />
            {:else}
              <ChevronDownOutline class="w-4 h-4" />
            {/if}
            {showJsonPreview ? "Hide" : "Show"} JSON
          </Button>

          <div class="flex gap-3">
            <Button
              color="alternative"
              onclick={cancelComment}
              disabled={isSubmittingComment}
            >
              Cancel
            </Button>
            <Button
              color="primary"
              onclick={submitComment}
              disabled={isSubmittingComment || !commentContent.trim()}
            >
              {isSubmittingComment ? "Posting..." : "Post Comment"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  {/if}
</div>
