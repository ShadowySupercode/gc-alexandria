import type { NDKEvent } from '@nostr-dev-kit/ndk';
import * as nip19 from 'nostr-tools/nip19';
import { get } from 'svelte/store';
import type { Readable } from 'svelte/store';

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
export function neventEncode(event: NDKEvent, relays?: RelayInput): string {
  const relayUrls = getRelayUrls(relays);
  return nip19.neventEncode({
    id: event.id,
    relays: relayUrls,
  });
}

/**
 * Encodes an event into an naddr identifier
 * @param event The event to encode
 * @param relays Optional array of relay URLs to include
 * @returns The encoded naddr identifier
 */
export function naddrEncode(event: NDKEvent, relays?: RelayInput): string {
  const relayUrls = getRelayUrls(relays);
  const dTag = event.getTagValue('d');
  if (!dTag) {
    throw new Error('Event must have a d-tag to be encoded as naddr');
  }
  return nip19.naddrEncode({
    kind: event.kind,
    pubkey: event.pubkey,
    identifier: dTag,
    relays: relayUrls,
  });
} 