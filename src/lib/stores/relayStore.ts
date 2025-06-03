import { writable, get } from "svelte/store";
import { getNostrClient } from '$lib/nostr/client';
import type { NostrEvent } from '$lib/types/nostr';
import { getEventHash } from '$lib/utils/eventUtils';
import { selectedRelayGroup } from '$lib/utils/relayGroupUtils';
import { withTimeout } from '$lib/utils/commonUtils';

// Utility to normalize relay URLs (trailing slash, lowercase)
function normalizeRelayUrl(url: string): string {
  return url.trim().replace(/\/+$/, '').toLowerCase();
}

// User relay stores
export const userInboxRelays = writable<string[]>([]);
export const userOutboxRelays = writable<string[]>([]);

// Store for responsive local relays
export const responsiveLocalRelays = writable<string[]>([]);

// Store for blocked relays
export const blockedRelays = writable<string[]>([]);

// Helper functions for managing blocked relays
export const blockedRelaysHydrated = writable(false);

export async function fetchBlockedRelays(userPubkey: string): Promise<void> {
  const client = getNostrClient(get(selectedRelayGroup).inbox);
  let events: NostrEvent[] = [];
  try {
    events = await withTimeout(
      client.fetchEvents({
        kinds: [10006],
        authors: [userPubkey],
      }),
      5000 // 5 seconds
    );
  } catch (err) {
    console.error('Timeout or error fetching blocked relays:', err);
    blockedRelays.set([]);
    blockedRelaysHydrated.set(true);
    return;
  }

  console.log('Fetched kind 10006 events:', events);

  // Get the latest event (they are replaceable)
  const latestEvent = events.sort((a, b) => b.created_at - a.created_at)[0];
  
  if (latestEvent) {
    // Parse blocked relays from tags
    const blocked = latestEvent.tags
      .filter(tag => tag[0] === 'r')
      .map(tag => normalizeRelayUrl(tag[1]));
    blockedRelays.set(blocked);
    blockedRelaysHydrated.set(true);
  } else {
    blockedRelays.set([]);
    blockedRelaysHydrated.set(true);
  }
}

export async function blockRelay(relay: string): Promise<void> {
  const client = getNostrClient(get(selectedRelayGroup).inbox);
  const user = client.getActiveUser();
  if (!user) {
    throw new Error('No active user found');
  }

  const normalizedRelay = normalizeRelayUrl(relay);
  const currentBlocked = get(blockedRelays);
  
  // Don't add if already blocked
  if (currentBlocked.includes(normalizedRelay)) {
    return;
  }

  // Create new blocked relays list
  const newBlocked = [...currentBlocked, normalizedRelay];

  // Create kind 10006 event
  const event: Omit<NostrEvent, 'id' | 'sig'> = {
    kind: 10006,
    created_at: Math.floor(Date.now() / 1000),
    tags: newBlocked.map(relay => ['r', relay]),
    content: '',
    pubkey: user.pubkey,
  };

  // Sign and publish the event
  if (!window.nostr) {
    throw new Error('Nostr WebExtension not found');
  }

  const signedEvent = await window.nostr.signEvent(event);
  const publishedEvent: NostrEvent = {
    ...signedEvent,
    id: getEventHash(event),
  };

  await client.publish(publishedEvent);
  
  // Update local store
  blockedRelays.set(newBlocked);
}

export async function unblockRelay(relay: string): Promise<void> {
  const client = getNostrClient(get(selectedRelayGroup).inbox);
  const user = client.getActiveUser();
  if (!user) {
    throw new Error('No active user found');
  }

  const normalizedRelay = normalizeRelayUrl(relay);
  const currentBlocked = get(blockedRelays);
  
  // Don't remove if not blocked
  if (!currentBlocked.includes(normalizedRelay)) {
    return;
  }

  // Create new blocked relays list
  const newBlocked = currentBlocked.filter(r => r !== normalizedRelay);

  // Create kind 10006 event
  const event: Omit<NostrEvent, 'id' | 'sig'> = {
    kind: 10006,
    created_at: Math.floor(Date.now() / 1000),
    tags: newBlocked.map(relay => ['r', relay]),
    content: '',
    pubkey: user.pubkey,
  };

  // Sign and publish the event
  if (!window.nostr) {
    throw new Error('Nostr WebExtension not found');
  }

  const signedEvent = await window.nostr.signEvent(event);
  const publishedEvent: NostrEvent = {
    ...signedEvent,
    id: getEventHash(event),
  };

  await client.publish(publishedEvent);
  
  // Update local store
  blockedRelays.set(newBlocked);
}

export function isRelayBlocked(relay: string): boolean {
  const normalizedRelay = normalizeRelayUrl(relay);
  return get(blockedRelays).includes(normalizedRelay);
}

// Helper to filter out blocked relays from an array
export function filterBlockedRelays(relays: string[]): string[] {
  // Normalize all blocked relays once
  const blocked = get(blockedRelays).map(normalizeRelayUrl);
  return relays.filter(relay => !blocked.includes(normalizeRelayUrl(relay)));
}

// Helper function to update responsive local relays
export function updateResponsiveLocalRelays(relays: string[]) {
  responsiveLocalRelays.set(relays);
}
