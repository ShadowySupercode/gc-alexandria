import type { NostrEvent } from '$lib/types/nostr';
import { get } from 'svelte/store';
import type { Readable } from 'svelte/store';
import { getTagValue } from './eventUtils';
import { neventEncode as encodeNevent, naddrEncode as encodeNaddr } from './identifierUtils';

type RelayInput = string[] | Readable<string[]> | undefined;

/**
 * Gets the current value of a relay input, whether it's a store or direct array
 */
function getRelayUrls(relays: RelayInput): string[] | undefined {
  if (!relays) return undefined;
  if (typeof relays === 'object' && 'subscribe' in relays) {
    return get(relays as Readable<string[]>);
  }
  return relays as string[];
}

/**
 * Encodes an event ID into a nevent identifier
 * @param event The event to encode
 * @param relays Optional array of relay URLs to include
 * @returns The encoded nevent identifier
 */
export function neventEncode(event: NostrEvent, relays?: RelayInput): string {
  const relayUrls = getRelayUrls(relays);
  return encodeNevent(event, relayUrls ?? []);
}

/**
 * Encodes an event into an naddr identifier
 * @param event The event to encode
 * @param relays Optional array of relay URLs to include
 * @returns The encoded naddr identifier
 */
export function naddrEncode(event: NostrEvent, relays?: RelayInput): string {
  const relayUrls = getRelayUrls(relays);
  const dTag = getTagValue(event, 'd');
  if (!dTag) {
    throw new Error('Event must have a d-tag to be encoded as naddr');
  }
  return encodeNaddr(event, relayUrls ?? []);
} 