<script lang="ts">
  import { getContext, onMount, onDestroy } from "svelte";
  import { Button, Modal, Textarea, P } from "flowbite-svelte";
  import { NDKEvent } from "@nostr-dev-kit/ndk";
  import type NDK from "@nostr-dev-kit/ndk";
  import { userStore } from "$lib/stores/userStore";
  import { activeOutboxRelays, activeInboxRelays } from "$lib/ndk";
  import { communityRelays } from "$lib/consts";
  import { WebSocketPool } from "$lib/data_structures/websocket_pool";
  import { ChevronDownOutline, ChevronUpOutline } from "flowbite-svelte-icons";

  let {
    isActive = false,
    publicationEvent,
    onHighlightCreated,
  }: {
    isActive: boolean;
    publicationEvent: NDKEvent;
    onHighlightCreated?: () => void;
  } = $props();

  const ndk: NDK = getContext("ndk");

  let showConfirmModal = $state(false);
  let selectedText = $state("");
  let selectionContext = $state("");
  let comment = $state("");
  let isSubmitting = $state(false);
  let feedbackMessage = $state("");
  let showFeedback = $state(false);
  let showJsonPreview = $state(false);

  // Store the selection range and section info for creating highlight
  let currentSelection: Selection | null = null;
  let selectedSectionAddress = $state<string | undefined>(undefined);
  let selectedSectionEventId = $state<string | undefined>(undefined);

  // Build preview JSON for the highlight event
  let previewJson = $derived.by(() => {
    if (!selectedText) return null;

    const useAddress = selectedSectionAddress || publicationEvent.tagAddress();
    const useEventId = selectedSectionEventId || publicationEvent.id;

    const tags: string[][] = [];

    if (useAddress) {
      tags.push(["a", useAddress, ""]);
    } else if (useEventId) {
      tags.push(["e", useEventId, ""]);
    }

    if (selectionContext) {
      tags.push(["context", selectionContext]);
    }

    let authorPubkey = publicationEvent.pubkey;
    if (useAddress && useAddress.includes(":")) {
      authorPubkey = useAddress.split(":")[1];
    }
    if (authorPubkey) {
      tags.push(["p", authorPubkey, "", "author"]);
    }

    if (comment.trim()) {
      tags.push(["comment", comment.trim()]);
    }

    return {
      kind: 9802,
      pubkey: $userStore.pubkey || "<your-pubkey>",
      created_at: Math.floor(Date.now() / 1000),
      tags: tags,
      content: selectedText,
      id: "<calculated-on-signing>",
      sig: "<calculated-on-signing>",
    };
  });

  function handleMouseUp(event: MouseEvent) {
    if (!isActive) return;
    if (!$userStore.signedIn) {
      showFeedbackMessage("Please sign in to create highlights", "error");
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const text = selection.toString().trim();
    if (!text || text.length < 3) return;

    // Check if the selection is within the publication content
    const target = event.target as HTMLElement;

    // Find the closest section element with an id (PublicationSection)
    // Don't use closest('.publication-leather') as Details also has that class
    const publicationSection = target.closest("section[id]") as HTMLElement;
    if (!publicationSection) {
      return;
    }

    // Get the specific section's event address and ID from data attributes
    const sectionAddress = publicationSection.dataset.eventAddress;
    const sectionEventId = publicationSection.dataset.eventId;

    currentSelection = selection;
    selectedText = text;
    selectedSectionAddress = sectionAddress;
    selectedSectionEventId = sectionEventId;
    selectionContext = ""; // Will be set below

    // Get surrounding context (the paragraph or section)
    const parentElement = selection.anchorNode?.parentElement;
    if (parentElement) {
      const contextElement = parentElement.closest("p, section, div");
      if (contextElement) {
        selectionContext = contextElement.textContent?.trim() || "";
      }
    }

    showConfirmModal = true;
  }

  async function createHighlight() {
    if (!$userStore.signer || !ndk) {
      showFeedbackMessage("Please sign in to create highlights", "error");
      return;
    }

    if (!$userStore.pubkey) {
      showFeedbackMessage("User pubkey not available", "error");
      return;
    }

    isSubmitting = true;

    try {
      const event = new NDKEvent(ndk);
      event.kind = 9802;
      event.content = selectedText;
      event.pubkey = $userStore.pubkey; // Set pubkey from user store

      // Use the specific section's address/ID if available, otherwise fall back to publication event
      const useAddress =
        selectedSectionAddress || publicationEvent.tagAddress();
      const useEventId = selectedSectionEventId || publicationEvent.id;

      const tags: string[][] = [];

      // Always prefer addressable events for publications
      if (useAddress) {
        // Addressable event - use "a" tag
        tags.push(["a", useAddress, ""]);
      } else if (useEventId) {
        // Regular event - use "e" tag
        tags.push(["e", useEventId, ""]);
      }

      // Add context tag
      if (selectionContext) {
        tags.push(["context", selectionContext]);
      }

      // Add author tag - extract from address or use publication event
      let authorPubkey = publicationEvent.pubkey;
      if (useAddress && useAddress.includes(":")) {
        // Extract pubkey from address format "kind:pubkey:identifier"
        authorPubkey = useAddress.split(":")[1];
      }
      if (authorPubkey) {
        tags.push(["p", authorPubkey, "", "author"]);
      }

      // Add comment tag if user provided a comment (quote highlight)
      if (comment.trim()) {
        tags.push(["comment", comment.trim()]);
      }

      event.tags = tags;

      // Sign the event - create plain object to avoid proxy issues
      const plainEvent = {
        kind: Number(event.kind),
        pubkey: String(event.pubkey),
        created_at: Number(event.created_at ?? Math.floor(Date.now() / 1000)),
        tags: event.tags.map((tag) => tag.map(String)),
        content: String(event.content),
      };

      if (
        typeof window !== "undefined" &&
        window.nostr &&
        window.nostr.signEvent
      ) {
        const signed = await window.nostr.signEvent(plainEvent);
        event.sig = signed.sig;
        if ("id" in signed) {
          event.id = signed.id as string;
        }
      } else {
        await event.sign($userStore.signer);
      }

      // Build relay list following the same pattern as eventServices
      const relays = [
        ...communityRelays,
        ...$activeOutboxRelays,
        ...$activeInboxRelays,
      ];

      // Remove duplicates
      const uniqueRelays = Array.from(new Set(relays));

      const signedEvent = {
        ...plainEvent,
        id: event.id,
        sig: event.sig,
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
                  WebSocketPool.instance.release(ws);
                  resolve();
                } else {
                  WebSocketPool.instance.release(ws);
                  reject(new Error(message));
                }
              }
            };

            // Send the event to the relay
            ws.send(JSON.stringify(["EVENT", signedEvent]));
          });
        } catch (e) {
          console.error(
            `[HighlightSelectionHandler] Failed to publish to ${relayUrl}:`,
            e,
          );
        }
      }

      if (publishedCount === 0) {
        throw new Error("Failed to publish to any relays");
      }

      showFeedbackMessage(
        `Highlight created and published to ${publishedCount} relay(s)!`,
        "success",
      );

      // Clear the selection
      if (currentSelection) {
        currentSelection.removeAllRanges();
      }

      // Reset state
      showConfirmModal = false;
      selectedText = "";
      selectionContext = "";
      comment = "";
      selectedSectionAddress = undefined;
      selectedSectionEventId = undefined;
      showJsonPreview = false;
      currentSelection = null;

      // Notify parent component
      if (onHighlightCreated) {
        onHighlightCreated();
      }
    } catch (error) {
      console.error("Failed to create highlight:", error);
      showFeedbackMessage(
        "Failed to create highlight. Please try again.",
        "error",
      );
    } finally {
      isSubmitting = false;
    }
  }

  function cancelHighlight() {
    showConfirmModal = false;
    selectedText = "";
    selectionContext = "";
    comment = "";
    selectedSectionAddress = undefined;
    selectedSectionEventId = undefined;
    showJsonPreview = false;

    // Clear the selection
    if (currentSelection) {
      currentSelection.removeAllRanges();
    }
    currentSelection = null;
  }

  function showFeedbackMessage(message: string, type: "success" | "error") {
    feedbackMessage = message;
    showFeedback = true;
    setTimeout(() => {
      showFeedback = false;
    }, 3000);
  }

  onMount(() => {
    // Only listen to mouseup on the document
    document.addEventListener("mouseup", handleMouseUp);
  });

  onDestroy(() => {
    document.removeEventListener("mouseup", handleMouseUp);
  });

  // Add visual indicator when highlight mode is active
  $effect(() => {
    if (isActive) {
      document.body.classList.add("highlight-mode-active");
    } else {
      document.body.classList.remove("highlight-mode-active");
    }

    // Cleanup when component unmounts
    return () => {
      document.body.classList.remove("highlight-mode-active");
    };
  });
</script>

{#if showConfirmModal}
  <Modal
    title="Create Highlight"
    bind:open={showConfirmModal}
    autoclose={false}
    size="md"
  >
    <div class="space-y-4">
      <div>
        <P class="text-sm font-semibold mb-2">Selected Text:</P>
        <div
          class="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg max-h-32 overflow-y-auto"
        >
          <P class="text-sm italic">"{selectedText}"</P>
        </div>
      </div>

      <div>
        <label for="comment" class="block text-sm font-semibold mb-2">
          Add a Comment (Optional):
        </label>
        <Textarea
          id="comment"
          bind:value={comment}
          placeholder="Share your thoughts about this highlight..."
          rows={3}
          class="w-full"
        />
      </div>

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

      <div class="flex justify-between items-center">
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

        <div class="flex space-x-2">
          <Button
            color="alternative"
            onclick={cancelHighlight}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            color="primary"
            onclick={createHighlight}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Creating..." : "Create Highlight"}
          </Button>
        </div>
      </div>
    </div>
  </Modal>
{/if}

{#if showFeedback}
  <div
    class="fixed bottom-4 right-4 z-50 p-4 rounded-lg shadow-lg {feedbackMessage.includes(
      'success',
    )
      ? 'bg-green-500 text-white'
      : 'bg-red-500 text-white'}"
  >
    {feedbackMessage}
  </div>
{/if}

<style>
  :global(body.highlight-mode-active .publication-leather) {
    cursor: text;
    user-select: text;
  }

  :global(body.highlight-mode-active .publication-leather *) {
    cursor: text;
  }
</style>
