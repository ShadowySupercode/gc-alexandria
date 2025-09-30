import NDK, { NDKEvent, NDKRelaySet } from "@nostr-dev-kit/ndk";
import { createSignedEvent } from "./nostrEventService.ts";
import { anonymousRelays } from "../consts.ts";
import { buildCompleteRelaySet } from "./relay_management.ts";

// AI-NOTE: Using existing relay utilities from relay_management.ts instead of duplicating functionality

/**
 * Gets optimal relay set for kind 24 messages between two users
 * @param senderPubkey The sender's pubkey
 * @param recipientPubkey The recipient's pubkey
 * @returns Promise resolving to relay URLs prioritized by commonality
 */
export async function getKind24RelaySet(
  senderPubkey: string,
  recipientPubkey: string,
  ndk: NDK,
): Promise<string[]> {
  const senderPrefix = senderPubkey.slice(0, 8);
  const recipientPrefix = recipientPubkey.slice(0, 8);

  console.log(
    `[getKind24RelaySet] Getting relays for ${senderPrefix} -> ${recipientPrefix}`,
  );

  try {
    // Fetch both users' complete relay sets using existing utilities
    const [senderRelaySet, recipientRelaySet] = await Promise.all([
      buildCompleteRelaySet(ndk, ndk.getUser({ pubkey: senderPubkey })),
      buildCompleteRelaySet(ndk, ndk.getUser({ pubkey: recipientPubkey })),
    ]);

    // Use sender's outbox relays and recipient's inbox relays
    const senderOutboxRelays = senderRelaySet.outboxRelays;
    const recipientInboxRelays = recipientRelaySet.inboxRelays;

    // Prioritize common relays for better privacy
    const commonRelays = senderOutboxRelays.filter((relay: any) =>
      recipientInboxRelays.includes(relay)
    );
    const senderOnlyRelays = senderOutboxRelays.filter(
      (relay: any) => !recipientInboxRelays.includes(relay),
    );
    const recipientOnlyRelays = recipientInboxRelays.filter(
      (relay: any) => !senderOutboxRelays.includes(relay),
    );

    // Prioritize: common relays first, then sender outbox, then recipient inbox
    const finalRelays = [
      ...commonRelays,
      ...senderOnlyRelays,
      ...recipientOnlyRelays,
    ];

    console.log(
      `[getKind24RelaySet] ${senderPrefix}->${recipientPrefix} - Common: ${commonRelays.length}, Sender-only: ${senderOnlyRelays.length}, Recipient-only: ${recipientOnlyRelays.length}, Total: ${finalRelays.length}`,
    );

    return finalRelays;
  } catch (error) {
    console.error(
      `[getKind24RelaySet] Error getting relay set for ${senderPrefix}->${recipientPrefix}:`,
      error,
    );
    throw error;
  }
}

/**
 * Creates a kind 24 public message reply according to NIP-A4
 * @param content The message content
 * @param recipientPubkey The recipient's pubkey
 * @param originalEvent The original event being replied to (optional)
 * @returns Promise resolving to publish result with relay information
 */
export async function createKind24Reply(
  content: string,
  recipientPubkey: string,
  ndk: NDK,
  originalEvent?: NDKEvent,
): Promise<{
  success: boolean;
  eventId?: string;
  error?: string;
  relays?: string[];
}> {
  if (!ndk?.activeUser) {
    return { success: false, error: "Not logged in" };
  }

  if (!content.trim()) {
    return { success: false, error: "Message content cannot be empty" };
  }

  try {
    // Get optimal relay set for this sender-recipient pair
    const targetRelays = await getKind24RelaySet(
      ndk.activeUser.pubkey,
      recipientPubkey,
      ndk,
    );

    if (targetRelays.length === 0) {
      return { success: false, error: "No relays available for publishing" };
    }

    // Build tags for the kind 24 event
    const tags: string[][] = [
      ["p", recipientPubkey, targetRelays[0]], // Use first relay as primary
    ];

    // Add q tag if replying to an original event
    if (originalEvent) {
      tags.push(["q", originalEvent.id, targetRelays[0] || anonymousRelays[0]]);
    }

    // Create and sign the event
    const { event: signedEventData } = await createSignedEvent(
      content,
      ndk.activeUser.pubkey,
      24,
      tags,
    );

    // Create NDKEvent and publish
    const event = new NDKEvent(ndk, signedEventData);
    const relaySet = NDKRelaySet.fromRelayUrls(targetRelays, ndk);
    const publishedToRelays = await event.publish(relaySet);

    if (publishedToRelays.size > 0) {
      console.log(
        `[createKind24Reply] Successfully published to ${publishedToRelays.size} relays`,
      );
      return { success: true, eventId: event.id, relays: targetRelays };
    } else {
      console.warn(`[createKind24Reply] Failed to publish to any relays`);
      return {
        success: false,
        error: "Failed to publish to any relays",
        relays: targetRelays,
      };
    }
  } catch (error) {
    console.error("[createKind24Reply] Error creating kind 24 reply:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
