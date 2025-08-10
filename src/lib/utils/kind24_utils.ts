import { get } from "svelte/store";
import { ndkInstance } from "../ndk";
import { userStore } from "../stores/userStore";
import { NDKEvent, NDKRelaySet, NDKUser } from "@nostr-dev-kit/ndk";
import type NDK from "@nostr-dev-kit/ndk";
import { nip19 } from "nostr-tools";
import { createSignedEvent } from "./nostrEventService.ts";
import { anonymousRelays } from "../consts";

/**
 * Fetches user's outbox relays from NIP-65 relay list
 * @param ndk NDK instance
 * @param user User to fetch outbox relays for
 * @returns Promise that resolves to array of outbox relay URLs
 */
async function getUseroutboxRelays(ndk: NDK, user: NDKUser): Promise<string[]> {
  try {

    const relayList = await ndk.fetchEvent(
      {
        kinds: [10002],
        authors: [user.pubkey],
      }
    );

    if (!relayList) {
      return [];
    }

    const outboxRelays: string[] = [];
    relayList.tags.forEach((tag) => {
      if (tag[0] === 'r' && tag[1]) {
        // NIP-65: r tags with optional inbox/outbox markers
        const marker = tag[2];
        if (!marker || marker === 'outbox' || marker === 'both') {
          // If no marker, marker is 'outbox', or marker is 'both', it's an outbox relay
          outboxRelays.push(tag[1]);
        }
        // Note: inbox-only relays are NOT included in outbox relays
      }
    });


    return outboxRelays;
  } catch (error) {

    return [];
  }
}

/**
 * Fetches user's inbox relays from NIP-65 relay list
 * @param ndk NDK instance
 * @param user User to fetch inbox relays for
 * @returns Promise that resolves to array of inbox relay URLs
 */
async function getUserinboxRelays(ndk: NDK, user: NDKUser): Promise<string[]> {
  try {
    console.log(`[getUserinboxRelays] Fetching kind 10002 for user: ${user.pubkey.slice(0, 8)}`);

    const relayList = await ndk.fetchEvent(
      {
        kinds: [10002],
        authors: [user.pubkey],
      }
    );

    if (!relayList) {
      console.log(`[getUserinboxRelays] No kind 10002 relay list found for user: ${user.pubkey.slice(0, 8)}`);
      return [];
    }

    console.log(`[getUserinboxRelays] Found relay list for user: ${user.pubkey.slice(0, 8)}, tags:`, relayList.tags);

    const inboxRelays: string[] = [];
    relayList.tags.forEach((tag) => {
      if (tag[0] === 'r' && tag[1]) {
        // NIP-65: r tags with optional inbox/outbox markers
        const marker = tag[2];
        console.log(`[getUserinboxRelays] Processing relay tag:`, tag, `marker: ${marker}`);
        if (!marker || marker === 'inbox' || marker === 'both') {
          // If no marker, marker is 'inbox', or marker is 'both', it's an inbox relay
          inboxRelays.push(tag[1]);
          console.log(`[getUserinboxRelays] Added inbox relay: ${tag[1]} (marker: ${marker || 'none'})`);
        }
        // Note: outbox-only relays are NOT included in inbox relays
      }
    });

    console.log(`[getUserinboxRelays] Final inbox relays for user ${user.pubkey.slice(0, 8)}:`, inboxRelays);
    return inboxRelays;
  } catch (error) {
    console.error(`[getUserinboxRelays] Error fetching inbox relays for user ${user.pubkey.slice(0, 8)}:`, error);
    return [];
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
  originalEvent?: NDKEvent
): Promise<{ success: boolean; eventId?: string; error?: string; relays?: string[] }> {
  const ndk = get(ndkInstance);
  if (!ndk?.activeUser) {
    return { success: false, error: "Not logged in" };
  }

  if (!content.trim()) {
    return { success: false, error: "Message content cannot be empty" };
  }

  try {
    // Get sender's outbox relays (NIP-65)
    const senderoutboxRelays = await getUseroutboxRelays(ndk, ndk.activeUser);
    
    // Get recipient's inbox relays (NIP-65)
    const recipientUser = ndk.getUser({ pubkey: recipientPubkey });
    let recipientinboxRelays = await getUserinboxRelays(ndk, recipientUser);
    
    // Fallback: if no inbox relays found, use recipient's outbox relays
    if (recipientinboxRelays.length === 0) {
      console.log(`[createKind24Reply] No inbox relays found for recipient, falling back to outbox relays`);
      recipientinboxRelays = await getUseroutboxRelays(ndk, recipientUser);
    }
    
    // According to NIP-A4: Messages MUST be sent to the NIP-65 inbox relays of each receiver 
    // and the outbox relay of the sender
    const targetRelays = [...new Set([...senderoutboxRelays, ...recipientinboxRelays])];
    
    // Prioritize common relays between sender and recipient for better privacy
    const commonRelays = senderoutboxRelays.filter(relay => 
      recipientinboxRelays.includes(relay)
    );
    const senderOnlyRelays = senderoutboxRelays.filter(relay => 
      !recipientinboxRelays.includes(relay)
    );
    const recipientOnlyRelays = recipientinboxRelays.filter(relay => 
      !senderoutboxRelays.includes(relay)
    );
    
    // Prioritize: common relays first, then sender outbox, then recipient inbox
    const prioritizedRelays = [...commonRelays, ...senderOnlyRelays, ...recipientOnlyRelays];
    
    if (prioritizedRelays.length === 0) {
      return { success: false, error: "No relays available for publishing" };
    }

    // Use the content as-is, quoted content is handled via q tag
    const finalContent = content;
    
    // Build tags for the kind 24 event
    const tags: string[][] = [
      ["p", recipientPubkey, prioritizedRelays[0]] // Use first relay as primary
    ];
    
    // Add q tag if replying to an original event
    if (originalEvent) {
      tags.push(["q", originalEvent.id, prioritizedRelays[0] || anonymousRelays[0]]);
    }
    
    // Create and sign the event using the unified function (includes expiration tag)
    const { event: signedEventData } = await createSignedEvent(
      finalContent,
      ndk.activeUser.pubkey,
      24,
      tags
    );
    
    // Create NDKEvent from the signed event data
    const event = new NDKEvent(ndk, signedEventData);

    // Publish to relays
    const relaySet = NDKRelaySet.fromRelayUrls(prioritizedRelays, ndk);
    const publishedToRelays = await event.publish(relaySet);

    if (publishedToRelays.size > 0) {
      return { success: true, eventId: event.id, relays: prioritizedRelays };
    } else {
      return { success: false, error: "Failed to publish to any relays", relays: prioritizedRelays };
    }
  } catch (error) {
    console.error("[kind24_utils] Error creating kind 24 reply:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}

/**
 * Gets optimal relay set for kind 24 messages between two users
 * @param senderPubkey The sender's pubkey
 * @param recipientPubkey The recipient's pubkey
 * @returns Promise resolving to relay URLs prioritized by commonality
 */
export async function getKind24RelaySet(
  senderPubkey: string,
  recipientPubkey: string
): Promise<string[]> {
  const ndk = get(ndkInstance);
  if (!ndk) {
    throw new Error("NDK not available");
  }

  console.log(`[getKind24RelaySet] Getting relays for sender: ${senderPubkey.slice(0, 8)} -> recipient: ${recipientPubkey.slice(0, 8)}`);

  // Get sender's outbox relays (NIP-65)
  const senderUser = ndk.getUser({ pubkey: senderPubkey });
  const senderoutboxRelays = await getUseroutboxRelays(ndk, senderUser);
  console.log(`[getKind24RelaySet] Sender outbox relays:`, senderoutboxRelays);
  
  // Get recipient's inbox relays (NIP-65)
  const recipientUser = ndk.getUser({ pubkey: recipientPubkey });
  let recipientinboxRelays = await getUserinboxRelays(ndk, recipientUser);
  console.log(`[getKind24RelaySet] Recipient inbox relays:`, recipientinboxRelays);
  
  // Fallback: if no inbox relays found, use recipient's outbox relays
  if (recipientinboxRelays.length === 0) {
    console.log(`[getKind24RelaySet] No inbox relays found for recipient, falling back to outbox relays`);
    recipientinboxRelays = await getUseroutboxRelays(ndk, recipientUser);
    console.log(`[getKind24RelaySet] Recipient outbox relays (used as fallback):`, recipientinboxRelays);
  }
  
  // According to NIP-A4: Messages MUST be sent to the NIP-65 inbox relays of each receiver 
  // and the outbox relay of the sender
  const targetRelays = [...new Set([...senderoutboxRelays, ...recipientinboxRelays])];
  console.log(`[getKind24RelaySet] Combined target relays:`, targetRelays);
  
  // Prioritize common relays between sender and recipient for better privacy
  const commonRelays = senderoutboxRelays.filter((relay: string) => 
    recipientinboxRelays.includes(relay)
  );
  const senderOnlyRelays = senderoutboxRelays.filter((relay: string) => 
    !recipientinboxRelays.includes(relay)
  );
  const recipientOnlyRelays = recipientinboxRelays.filter((relay: string) => 
    !senderoutboxRelays.includes(relay)
  );
  
  console.log(`[getKind24RelaySet] Common relays:`, commonRelays);
  console.log(`[getKind24RelaySet] Sender-only relays:`, senderOnlyRelays);
  console.log(`[getKind24RelaySet] Recipient-only relays:`, recipientOnlyRelays);
  
  // Prioritize: common relays first, then sender outbox, then recipient inbox
  const finalRelays = [...commonRelays, ...senderOnlyRelays, ...recipientOnlyRelays];
  console.log(`[getKind24RelaySet] Final relay list:`, finalRelays);
  return finalRelays;
}
