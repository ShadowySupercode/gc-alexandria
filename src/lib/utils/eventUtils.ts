import { bytesToHex } from '@noble/hashes/utils';
import { sha256 } from '@noble/hashes/sha256';
import { schnorr } from '@noble/curves/secp256k1';
import type { NostrEvent } from '$lib/types/nostr';
import { getNostrClient } from '$lib/nostr/client';
import type { EventSearchResult } from './types';
import { selectedRelayGroup } from '$lib/utils/relayGroupUtils';
import { get } from 'svelte/store';

function toHexString(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Gets the event hash for a Nostr event
 */
export function getEventHash(event: Omit<NostrEvent, 'id' | 'sig'>): string {
  const serialized = JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content,
  ]);
  return bytesToHex(sha256(serialized));
}

/**
 * Signs a Nostr event hash with the given private key
 */
export async function signEventHash(event: {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
  pubkey: string;
}): Promise<string> {
  const id = getEventHash(event);
  const sig = await schnorr.sign(id, event.pubkey);
  return bytesToHex(sig);
}

/**
 * Converts between NostrEvent and our NostrEvent interface
 */
export function toNostrEvent(event: NostrEvent): NostrEvent {
  return {
    id: event.id,
    pubkey: event.pubkey,
    created_at: event.created_at,
    kind: event.kind ?? 0,
    tags: event.tags,
    content: event.content,
    sig: event.sig,
  };
}

/**
 * Gets the tag address for an event (kind:pubkey:d-tag)
 */
export function getTagAddress(event: NostrEvent): string {
  const dTag = event.tags.find(tag => tag[0] === 'd')?.[1];
  if (!dTag) throw new Error('Event has no d tag');
  return `${event.kind}:${event.pubkey}:${dTag}`;
}

/**
 * Gets the node type (kind) for an event
 */
export function getNodeType(event: NostrEvent): number {
  return event.kind;
}

/**
 * Determines if an event is a parent publication (kind 30040 with at least one 'a' tag referencing another 30040)
 */
export function isParentPublication(event: NostrEvent): boolean {
  // Must be a 30040 event
  if (event.kind !== 30040) return false;

  // Must contain at least one 'a' tag that references another 30040
  return event.tags.some((tag) => {
    if (tag[0] !== "a") return false;
    const [kind] = tag[1].split(":");
    return kind === "30040";
  });
}

/**
 * Determines if an event is a top-level parent publication (not referenced by any other parent publication)
 */
export function isTopLevelParent(
  event: NostrEvent,
  allEvents: NostrEvent[],
): boolean {
  // Must be a parent publication
  if (!isParentPublication(event)) return false;

  // Check if any other parent publication references this one
  return !allEvents.some((otherEvent: NostrEvent) => {
    if (!isParentPublication(otherEvent)) return false;
    return otherEvent.tags.some((tag: string[]) => {
      if (tag[0] !== 'a') return false;
      const [kind, pubkey, dTag] = tag[1].split(':');
      return kind === '30040' && pubkey === event.pubkey && dTag === event.tags.find(t => t[0] === 'd')?.[1];
    });
  });
}

/**
 * Fetches an event by kind, author, and d-tag
 */
export async function fetchEventByDTag(
  kind: number,
  author: string,
  dTag: string,
  relays: string[] = get(selectedRelayGroup).inbox
): Promise<EventSearchResult> {
  const client = getNostrClient(relays);
  const events = await client.fetchEvents({
    kinds: [kind],
    authors: [author],
    "#d": [dTag],
  });
  return { event: events[0] || null };
}

/**
 * Removes `kind: 30040` index events that don't comply with the NKBIP-01 specification.
 * @param events A set of events.
 * @returns The filtered set of events.
 */
export function filterValidIndexEvents(events: Set<NostrEvent>): Set<NostrEvent> {
  // The filter object supports only limited parameters, so we need to filter out events that
  // don't respect NKBIP-01.
  events.forEach((event) => {
    // Index events have no content, and they must have `title`, `d`, and `e` tags.
    if (
      (event.content != null && event.content.length > 0) ||
      !event.tags.find(t => t[0] === 'title')?.[1] ||
      !event.tags.find(t => t[0] === 'd')?.[1] ||
      (event.tags.filter(t => t[0] === 'a').length === 0 &&
        event.tags.filter(t => t[0] === 'e').length === 0)
    ) {
      events.delete(event);
    }
  });

  console.debug(`Filtered index events: ${events.size} events remaining.`);
  return events;
}

/**
 * Search for an event by its identifier (nevent, note, naddr)
 */
export async function searchEventByIdentifier(
  identifier: string,
  options: {
    timeoutMs?: number;
    useFallbackRelays?: boolean;
    signal?: AbortSignal;
    relays?: string[];
  } = {},
): Promise<EventSearchResult> {
  const relayList = options.relays ?? get(selectedRelayGroup).inbox;
  const client = getNostrClient(relayList);
  const { timeoutMs = 3000, useFallbackRelays = false, signal } = options;

  try {
    // Try to decode as a note ID first
    try {
      const decoded = client.decodeNoteId(identifier);
      if (decoded.type === 'note') {
        const events = await client.fetchEvents({ ids: [decoded.value] });
        if (events.length > 0) {
          return { event: events[0] };
        }
      }
    } catch {
      // Not a note ID, continue with other formats
    }

    // Try to decode as a nevent
    try {
      const decoded = client.decodeNoteId(identifier);
      if (decoded.type === 'nevent') {
        const events = await client.fetchEvents({ ids: [decoded.id] });
        if (events.length > 0) {
          return { event: events[0] };
        }
      }
    } catch {
      // Not a nevent, continue with other formats
    }

    // Try to decode as an naddr
    try {
      const decoded = client.decodeNoteId(identifier);
      if (decoded.type === 'naddr') {
        const events = await client.fetchEvents({
          kinds: [decoded.kind],
          authors: [decoded.pubkey],
          "#d": [decoded.identifier],
        });
        if (events.length > 0) {
          return { event: events[0] };
        }
      }
    } catch {
      // Not an naddr, continue with other formats
    }

    // Not found
    return { event: null };
  } catch (err) {
    if (err instanceof Error && err.message === "Search cancelled") {
      console.log("Search cancelled by user");
      throw err;
    }
    console.error("Error in searchEventByIdentifier:", err);
    return { event: null };
  }
}

/**
 * Gets the first matching tag value for a given tag name from a NostrEvent.
 * @param event The NostrEvent object
 * @param tagName The tag name to match (e.g., 'title', 'd', 'a')
 * @returns The value of the first matching tag, or undefined if no match is found
 */
export function getTagValue<T = string>(
  event: NostrEvent,
  tagName: string,
): T | undefined {
  const matches = event.tags.filter((tag) => tag[0] === tagName);
  return matches[0]?.[1] as T | undefined;
}

/**
 * Gets all values from matching tags for a given tag name from a NostrEvent.
 * @param event The NostrEvent object
 * @param tagName The tag name to match (e.g., 'a', 'e', 'p')
 * @returns An array of values from all matching tags
 */
export function getTagValues<T = string>(
  event: NostrEvent,
  tagName: string,
): T[] {
  return event.tags
    .filter((tag) => tag[0] === tagName)
    .map((tag) => tag[1] as T);
}

/**
 * Validates a Nostr event according to NIP-01
 * @param event The event to validate
 * @returns true if the event is valid, false otherwise
 */
export function validateEvent(event: NostrEvent): boolean {
  // Check required fields
  if (!event.id || !event.pubkey || !event.created_at || !event.kind || !event.tags || !event.content || !event.sig) {
    return false;
  }

  // Check field types
  if (
    typeof event.id !== 'string' ||
    typeof event.pubkey !== 'string' ||
    typeof event.created_at !== 'number' ||
    typeof event.kind !== 'number' ||
    !Array.isArray(event.tags) ||
    typeof event.content !== 'string' ||
    typeof event.sig !== 'string'
  ) {
    return false;
  }

  // Check created_at is not in the future
  if (event.created_at > Math.floor(Date.now() / 1000) + 60) {
    return false;
  }

  // Check kind is valid
  if (event.kind < 0) {
    return false;
  }

  // Check tags are valid
  if (!event.tags.every(tag => Array.isArray(tag) && tag.every(item => typeof item === 'string'))) {
    return false;
  }

  // Check id matches the event hash
  const computedId = getEventHash(event);
  if (computedId !== event.id) {
    return false;
  }

  // Check signature
  return verifySignature(event);
}

/**
 * Verifies the signature of a Nostr event
 * @param event The event to verify
 * @returns true if the signature is valid, false otherwise
 */
export function verifySignature(event: NostrEvent): boolean {
  try {
    const serialized = JSON.stringify([
      0,
      event.pubkey,
      event.created_at,
      event.kind,
      event.tags,
      event.content
    ]);
    const hash = sha256(serialized);
    return schnorr.verify(event.sig, hash, event.pubkey);
  } catch (error) {
    console.error('Signature verification failed:', error);
    return false;
  }
}

/**
 * Signs a Nostr event with the given private key
 * @param event The event to sign
 * @param privateKey The private key to sign with
 * @returns The signed event
 */
export function signEvent(event: Omit<NostrEvent, 'id' | 'sig'>, privateKey: string): NostrEvent {
  // Add id
  const eventWithId = {
    ...event,
    id: getEventHash(event as NostrEvent)
  };

  // Sign the event
  const serialized = JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content
  ]);
  const hash = sha256(serialized);
  const sig = toHexString(schnorr.sign(hash, privateKey));

  return {
    ...eventWithId,
    sig
  };
}

/**
 * Creates a new Nostr event with the given parameters
 * @param params The event parameters
 * @param privateKey The private key to sign with
 * @returns The created and signed event
 */
export function createEvent(params: {
  pubkey: string;
  kind: number;
  content: string;
  tags?: string[][];
  created_at?: number;
}, privateKey: string): NostrEvent {
  const event: Omit<NostrEvent, 'id' | 'sig'> = {
    pubkey: params.pubkey,
    kind: params.kind,
    content: params.content,
    tags: params.tags || [],
    created_at: params.created_at || Math.floor(Date.now() / 1000)
  };

  return signEvent(event, privateKey);
} 