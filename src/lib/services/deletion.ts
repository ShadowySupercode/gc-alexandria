import NDK, { NDKEvent, NDKRelaySet } from "@nostr-dev-kit/ndk";

export interface DeletionOptions {
  eventId?: string;
  eventAddress?: string;
  eventKind?: number;
  reason?: string;
  onSuccess?: (deletionEventId: string) => void;
  onError?: (error: string) => void;
}

export interface DeletionResult {
  success: boolean;
  deletionEventId?: string;
  error?: string;
}

/**
 * Deletes a Nostr event by publishing a kind 5 deletion request (NIP-09)
 * @param options - Deletion options
 * @param ndk - NDK instance
 * @returns Promise resolving to deletion result
 */
export async function deleteEvent(
  options: DeletionOptions,
  ndk: NDK,
): Promise<DeletionResult> {
  const { eventId, eventAddress, eventKind, reason = "", onSuccess, onError } =
    options;

  if (!eventId && !eventAddress) {
    const error = "Either eventId or eventAddress must be provided";
    onError?.(error);
    return { success: false, error };
  }

  if (!ndk?.activeUser) {
    const error = "Please log in first";
    onError?.(error);
    return { success: false, error };
  }

  try {
    // Create deletion event (kind 5)
    const deletionEvent = new NDKEvent(ndk);
    deletionEvent.kind = 5;
    deletionEvent.created_at = Math.floor(Date.now() / 1000);
    deletionEvent.content = reason;
    deletionEvent.pubkey = ndk.activeUser.pubkey;

    // Build tags based on what we have
    const tags: string[][] = [];

    if (eventId) {
      // Add 'e' tag for event ID
      tags.push(["e", eventId]);
    }

    if (eventAddress) {
      // Add 'a' tag for replaceable event address
      tags.push(["a", eventAddress]);
    }

    if (eventKind) {
      // Add 'k' tag for event kind (recommended by NIP-09)
      tags.push(["k", eventKind.toString()]);
    }

    deletionEvent.tags = tags;

    // Sign the deletion event
    await deletionEvent.sign();

    // Publish to all available relays
    const allRelayUrls = Array.from(ndk.pool?.relays.values() || []).map(
      (r) => r.url,
    );

    if (allRelayUrls.length === 0) {
      throw new Error("No relays available in NDK pool");
    }

    const relaySet = NDKRelaySet.fromRelayUrls(allRelayUrls, ndk);
    const publishedToRelays = await deletionEvent.publish(relaySet);

    if (publishedToRelays.size > 0) {
      console.log(
        `[deletion.ts] Published deletion request to ${publishedToRelays.size} relays`,
      );
      const result = { success: true, deletionEventId: deletionEvent.id };
      onSuccess?.(deletionEvent.id);
      return result;
    } else {
      throw new Error("Failed to publish deletion request to any relays");
    }
  } catch (error) {
    const errorMessage = error instanceof Error
      ? error.message
      : "Unknown error";
    console.error(`[deletion.ts] Error deleting event: ${errorMessage}`);
    onError?.(errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Checks if the current user has permission to delete an event
 * @param event - The event to check
 * @param ndk - NDK instance
 * @returns True if the user can delete the event
 */
export function canDeleteEvent(event: NDKEvent | null, ndk: NDK): boolean {
  if (!event || !ndk?.activeUser) {
    return false;
  }

  // User can only delete their own events
  return event.pubkey === ndk.activeUser.pubkey;
}
