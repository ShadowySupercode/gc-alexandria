<script lang="ts">
  import { getContext, onMount, onDestroy } from "svelte";
  import { Button, Modal, Textarea, P } from "flowbite-svelte";
  import { NDKEvent } from "@nostr-dev-kit/ndk";
  import type NDK from "@nostr-dev-kit/ndk";
  import { userStore } from "$lib/stores/userStore";
  import { activeOutboxRelays } from "$lib/ndk";

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

  // Store the selection range for clearing later
  let currentSelection: Selection | null = null;

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
    const publicationSection = target.closest(".publication-leather");
    if (!publicationSection) return;

    currentSelection = selection;
    selectedText = text;

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

    isSubmitting = true;

    try {
      const event = new NDKEvent(ndk);
      event.kind = 9802;
      event.content = selectedText;

      // Determine if we're highlighting an addressable event or regular event
      const eventAddress = publicationEvent.tagAddress();
      const tags: string[][] = [];

      if (eventAddress) {
        // Addressable event - use "a" tag
        tags.push(["a", eventAddress, ""]);
      } else {
        // Regular event - use "e" tag
        tags.push(["e", publicationEvent.id, ""]);
      }

      // Add context tag
      if (selectionContext) {
        tags.push(["context", selectionContext]);
      }

      // Add author tag
      if (publicationEvent.pubkey) {
        tags.push(["p", publicationEvent.pubkey, "", "author"]);
      }

      // Add comment tag if user provided a comment (quote highlight)
      if (comment.trim()) {
        tags.push(["comment", comment.trim()]);
      }

      event.tags = tags;

      // Sign and publish the event
      await event.sign($userStore.signer);

      // Get outbox relays for publishing
      const relays = $activeOutboxRelays;
      if (relays.length > 0) {
        await event.publish();
      } else {
        // Fallback to default NDK publish
        await event.publish();
      }

      showFeedbackMessage("Highlight created successfully!", "success");

      // Clear the selection
      if (currentSelection) {
        currentSelection.removeAllRanges();
      }

      // Reset state
      showConfirmModal = false;
      selectedText = "";
      selectionContext = "";
      comment = "";
      currentSelection = null;

      // Notify parent component
      if (onHighlightCreated) {
        onHighlightCreated();
      }
    } catch (error) {
      console.error("Failed to create highlight:", error);
      showFeedbackMessage("Failed to create highlight. Please try again.", "error");
    } finally {
      isSubmitting = false;
    }
  }

  function cancelHighlight() {
    showConfirmModal = false;
    selectedText = "";
    selectionContext = "";
    comment = "";

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
  <Modal title="Create Highlight" bind:open={showConfirmModal} autoclose={false} size="md">
    <div class="space-y-4">
      <div>
        <P class="text-sm font-semibold mb-2">Selected Text:</P>
        <div class="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg max-h-32 overflow-y-auto">
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
          rows="3"
          class="w-full"
        />
      </div>

      <div class="flex justify-end space-x-2">
        <Button color="alternative" onclick={cancelHighlight} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button color="primary" onclick={createHighlight} disabled={isSubmitting}>
          {isSubmitting ? "Creating..." : "Create Highlight"}
        </Button>
      </div>
    </div>
  </Modal>
{/if}

{#if showFeedback}
  <div
    class="fixed bottom-4 right-4 z-50 p-4 rounded-lg shadow-lg {feedbackMessage.includes('success')
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
