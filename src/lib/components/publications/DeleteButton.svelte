<script lang="ts">
  import { Button, Modal } from "flowbite-svelte";
  import { TrashBinOutline } from "flowbite-svelte-icons";
  import { getContext } from "svelte";
  import type NDK from "@nostr-dev-kit/ndk";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";
  import { deleteEvent, canDeleteEvent } from "$lib/services/deletion";
  import { userStore } from "$lib/stores/userStore";

  let {
    address,
    leafEvent,
    onDeleted,
  }: {
    address: string;
    leafEvent: Promise<NDKEvent | null>;
    onDeleted?: () => void;
  } = $props();

  const ndk: NDK = getContext("ndk");

  let showDeleteModal = $state(false);
  let isDeleting = $state(false);
  let deleteError = $state<string | null>(null);
  let resolvedEvent = $state<NDKEvent | null>(null);

  // Check if user can delete this event
  let canDelete = $derived(canDeleteEvent(resolvedEvent, ndk));

  // Resolve the event promise
  $effect(() => {
    leafEvent.then(event => {
      resolvedEvent = event;
    });
  });

  async function handleDelete() {
    if (!resolvedEvent) {
      deleteError = "Event not found";
      return;
    }

    isDeleting = true;
    deleteError = null;

    const result = await deleteEvent(
      {
        eventId: resolvedEvent.id,
        eventAddress: address,
        eventKind: resolvedEvent.kind,
        reason: "Deleted by author",
        onSuccess: (deletionEventId) => {
          console.log(`[DeleteButton] Published deletion event: ${deletionEventId}`);
          showDeleteModal = false;
          onDeleted?.();
        },
        onError: (error) => {
          console.error(`[DeleteButton] Deletion failed: ${error}`);
          deleteError = error;
        },
      },
      ndk,
    );

    isDeleting = false;

    if (result.success) {
      console.log(`[DeleteButton] Successfully deleted section: ${address}`);
    }
  }

  function openDeleteModal() {
    deleteError = null;
    showDeleteModal = true;
  }
</script>

{#if canDelete}
  <Button
    color="red"
    size="xs"
    class="single-line-button opacity-0 transition-opacity duration-200"
    onclick={openDeleteModal}
  >
    <TrashBinOutline class="w-3 h-3 mr-1" />
    Delete
  </Button>

  <Modal bind:open={showDeleteModal} size="sm" title="Delete Section">
    <div class="text-center">
      <TrashBinOutline class="mx-auto mb-4 text-gray-400 w-12 h-12 dark:text-gray-200" />
      <h3 class="mb-5 text-lg font-normal text-gray-500 dark:text-gray-400">
        Are you sure you want to delete this section?
      </h3>
      <p class="mb-5 text-sm text-gray-500 dark:text-gray-400">
        This will publish a deletion request to all relays. Note that not all relays
        may honor this request, and the content may remain visible on some relays.
      </p>
      {#if deleteError}
        <p class="mb-5 text-sm text-red-500">{deleteError}</p>
      {/if}
      <div class="flex justify-center gap-4">
        <Button
          color="red"
          disabled={isDeleting}
          onclick={handleDelete}
        >
          {isDeleting ? "Deleting..." : "Yes, delete it"}
        </Button>
        <Button
          color="alternative"
          disabled={isDeleting}
          onclick={() => (showDeleteModal = false)}
        >
          No, cancel
        </Button>
      </div>
    </div>
  </Modal>
{/if}

<style>
  :global(.single-line-button) {
    opacity: 0;
  }
</style>
