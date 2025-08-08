import { get } from "svelte/store";
import { ndkInstance } from "../ndk";
import { userStore } from "../stores/userStore";
import { NDKEvent, NDKRelaySet, NDKUser } from "@nostr-dev-kit/ndk";
import type NDK from "@nostr-dev-kit/ndk";
import { nip19 } from "nostr-tools";

/**
 * Fetches user's outbox relays from NIP-65 relay list
 * @param ndk NDK instance
 * @param user User to fetch outbox relays for
 * @returns Promise that resolves to array of outbox relay URLs
 */
async function getUseroutboxRelays(ndk: NDK, user: NDKUser): Promise<string[]> {
  try {
    console.debug('[kind24_utils] Fetching outbox relays for user:', user.pubkey);
    const relayList = await ndk.fetchEvent(
      {
        kinds: [10002],
        authors: [user.pubkey],
      }
    );

    if (!relayList) {
      console.debug('[kind24_utils] No relay list found for user');
      return [];
    }

    console.debug('[kind24_utils] Found relay list event:', relayList.id);
    console.debug('[kind24_utils] Relay list tags:', relayList.tags);

    const outboxRelays: string[] = [];
    relayList.tags.forEach((tag) => {
      console.debug('[kind24_utils] Processing tag:', tag);
      if (tag[0] === 'r' && tag[1]) {
        // NIP-65: r tags with optional inbox/outbox markers
        const marker = tag[2];
        if (!marker || marker === 'outbox' || marker === 'inbox') {
          // If no marker or marker is 'outbox', it's a outbox relay
          // If marker is 'inbox', it's also a outbox relay (NIP-65 allows both)
          outboxRelays.push(tag[1]);
          console.debug('[kind24_utils] Added outbox relay:', tag[1]);
        }
      }
    });

    console.debug('[kind24_utils] Final outbox relays:', outboxRelays);
    return outboxRelays;
  } catch (error) {
    console.info('[kind24_utils] Error fetching user outbox relays:', error);
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
    console.debug('[kind24_utils] Fetching inbox relays for user:', user.pubkey);
    const relayList = await ndk.fetchEvent(
      {
        kinds: [10002],
        authors: [user.pubkey],
      }
    );

    if (!relayList) {
      console.debug('[kind24_utils] No relay list found for user');
      return [];
    }

    console.debug('[kind24_utils] Found relay list event:', relayList.id);
    console.debug('[kind24_utils] Relay list tags:', relayList.tags);

    const inboxRelays: string[] = [];
    relayList.tags.forEach((tag) => {
      console.debug('[kind24_utils] Processing tag:', tag);
      if (tag[0] === 'r' && tag[1]) {
        // NIP-65: r tags with optional inbox/outbox markers
        const marker = tag[2];
        if (!marker || marker === 'inbox' || marker === 'outbox') {
          // If no marker or marker is 'inbox', it's a inbox relay
          // If marker is 'outbox', it's also a inbox relay (NIP-65 allows both)
          inboxRelays.push(tag[1]);
          console.debug('[kind24_utils] Added inbox relay:', tag[1]);
        }
      }
    });

    console.debug('[kind24_utils] Final inbox relays:', inboxRelays);
    return inboxRelays;
  } catch (error) {
    console.info('[kind24_utils] Error fetching user inbox relays:', error);
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
    const recipientinboxRelays = await getUserinboxRelays(ndk, recipientUser);
    
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

    // Create the kind 24 event
    const event = new NDKEvent(ndk);
    event.kind = 24;
    
    // Build content with quoted message if replying
    let finalContent = content;
    if (originalEvent) {
      // Use multiple relays for better discoverability
      const nevent = nip19.neventEncode({ 
        id: originalEvent.id,
        relays: prioritizedRelays.slice(0, 3) // Use first 3 relays
      });
      const quotedContent = originalEvent.content ? originalEvent.content.slice(0, 200) : "No content";
      // Use a more visible quote format with a clickable link
      finalContent = `> QUOTED: ${quotedContent}\n> LINK: ${nevent}\n\n${content}`;
      console.log("[kind24_utils] Reply content:", finalContent);
    }
    
    event.content = finalContent;
    event.created_at = Math.floor(Date.now() / 1000);
    
    // Add p tag for recipient with relay URL
    const tags: string[][] = [
      ["p", recipientPubkey, prioritizedRelays[0]] // Use first relay as primary
    ];
    
    // Add q tag if replying to an original event
    if (originalEvent) {
      const nevent = nip19.neventEncode({ 
        id: originalEvent.id,
        relays: prioritizedRelays.slice(0, 3) // Use first 3 relays
      });
      tags.push(["q", nevent, prioritizedRelays[0]]);
    }
    
    event.tags = tags;
    event.pubkey = ndk.activeUser.pubkey;

    // Sign the event
    await event.sign();

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

  // Get sender's outbox relays (NIP-65)
  const senderUser = ndk.getUser({ pubkey: senderPubkey });
  const senderoutboxRelays = await getUseroutboxRelays(ndk, senderUser);
  
  // Get recipient's inbox relays (NIP-65)
  const recipientUser = ndk.getUser({ pubkey: recipientPubkey });
  const recipientinboxRelays = await getUserinboxRelays(ndk, recipientUser);
  
  // According to NIP-A4: Messages MUST be sent to the NIP-65 inbox relays of each receiver 
  // and the outbox relay of the sender
  const targetRelays = [...new Set([...senderoutboxRelays, ...recipientinboxRelays])];
  
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
  
  // Prioritize: common relays first, then sender outbox, then recipient inbox
  return [...commonRelays, ...senderOnlyRelays, ...recipientOnlyRelays];
}
