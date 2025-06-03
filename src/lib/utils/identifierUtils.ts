import type { NostrEvent } from '$lib/types/nostr';
import { getNostrClient } from '$lib/nostr/client';
import type { EventSearchResult } from './types';
import { getUserMetadata } from './profileUtils';
import { createProfileLink } from './profileUtils';
import { createNoteLink } from './profileUtils';
import { get } from 'svelte/store';
import { selectedRelayGroup } from '$lib/utils/relayGroupUtils';

// Regular expressions for Nostr identifiers - match the entire identifier including any prefix
export const NOSTR_PROFILE_REGEX =
  /(?<![\w/])((nostr:)?(npub|nprofile)[a-zA-Z0-9]{20,})(?![\w/])/g;
export const NOSTR_NOTE_REGEX =
  /(?<![\w/])((nostr:)?(note|nevent|naddr)[a-zA-Z0-9]{20,})(?![\w/])/g;

/**
 * Searches for a Nostr event using various identifier types
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
  if (typeof identifier !== 'string' || !identifier) {
    throw new Error('Identifier must be a string');
  }
  const cleanId = identifier.replace(/^nostr:/, '');
  console.log('identifier:', identifier, typeof identifier, cleanId);

  // Fast path: if it's a 64-char hex, fetch directly
  if (/^[a-f0-9]{64}$/i.test(cleanId)) {
    const events = await client.fetchEvents({ ids: [cleanId] });
    if (events.length > 0) {
      return { event: events[0] };
    }
  }

  // Try to decode as NIP-19
  try {
    const decoded = client.decodeNoteId(cleanId);
    let hex: string | undefined;
    let relays: string[] | undefined;

    // Handle different NIP-19 types
    switch (decoded.type) {
      case 'note':
      case 'npub':
        hex = decoded.value;
        break;
      case 'nevent':
        hex = decoded.id;
        relays = decoded.relays;
        break;
      case 'nprofile':
        hex = decoded.pubkey;
        relays = decoded.relays;
        break;
      case 'naddr': {
        const filter = {
          kinds: [decoded.kind],
          authors: [decoded.pubkey],
          "#d": [decoded.identifier],
        };
        const events = await client.fetchEvents(filter);
        if (events.length > 0) {
          return { event: events[0] };
        }
        return { event: null };
      }
    }

    // If we have a hex string, try different search strategies
    if (hex && /^[a-f0-9]{64}$/i.test(hex)) {
      const relayOpts = options.relays ?? (relays && relays.length > 0 ? relays : undefined);

      // Try as event ID first
      const events = await client.fetchEvents({ ids: [hex] });
      if (events.length > 0) {
        return { event: events[0] };
      }

      // Try as profile
      const profileEvents = await client.fetchEvents({ kinds: [0], authors: [hex] });
      if (profileEvents.length > 0) {
        return { event: profileEvents[0] };
      }

      // Try as tags
      const [aTagEvents, eTagEvents, pTagEvents] = await Promise.all([
        client.fetchEvents({ "#a": [hex] }),
        client.fetchEvents({ "#e": [hex] }),
        client.fetchEvents({ "#p": [hex] }),
      ]);

      if (aTagEvents.length > 0) return { event: aTagEvents[0] };
      if (eTagEvents.length > 0) return { event: eTagEvents[0] };
      if (pTagEvents.length > 0) return { event: pTagEvents[0] };
    }
  } catch {
    // Not a valid NIP-19 identifier, continue with other formats
  }

  // If it's a 64-char hex, try all search strategies
  if (/^[a-f0-9]{64}$/i.test(cleanId)) {
    // Try as event ID
    const events = await client.fetchEvents({ ids: [cleanId] });
    if (events.length > 0) {
      return { event: events[0] };
    }

    // Try as profile
    const profileEvents = await client.fetchEvents({ kinds: [0], authors: [cleanId] });
    if (profileEvents.length > 0) {
      return { event: profileEvents[0] };
    }

    // Try as tags
    const [aTagEvents, eTagEvents, pTagEvents] = await Promise.all([
      client.fetchEvents({ "#a": [cleanId] }),
      client.fetchEvents({ "#e": [cleanId] }),
      client.fetchEvents({ "#p": [cleanId] }),
    ]);

    if (aTagEvents.length > 0) return { event: aTagEvents[0] };
    if (eTagEvents.length > 0) return { event: eTagEvents[0] };
    if (pTagEvents.length > 0) return { event: pTagEvents[0] };
  }

  return { event: null };
}

/**
 * Process Nostr identifiers in text
 */
export async function processNostrIdentifiers(
  content: string,
): Promise<string> {
  let processedContent = content;

  // Helper to check if a match is part of a URL
  function isPartOfUrl(text: string, index: number): boolean {
    // Look for http(s):// or www. before the match
    const before = text.slice(Math.max(0, index - 12), index);
    return /https?:\/\/$|www\.$/i.test(before);
  }

  // Process profiles (npub and nprofile)
  const profileMatches = Array.from(content.matchAll(NOSTR_PROFILE_REGEX));
  for (const match of profileMatches) {
    const [fullMatch] = match;
    const matchIndex = match.index ?? 0;
    if (isPartOfUrl(content, matchIndex)) {
      continue; // skip if part of a URL
    }
    let identifier = fullMatch;
    if (!identifier.startsWith("nostr:")) {
      identifier = "nostr:" + identifier;
    }
    const metadata = await getUserMetadata(identifier);
    if (metadata) {
      const link = createProfileLink(identifier, metadata.name);
      processedContent = processedContent.replace(fullMatch, link);
    }
  }

  // Process notes (note, nevent, naddr)
  const noteMatches = Array.from(content.matchAll(NOSTR_NOTE_REGEX));
  for (const match of noteMatches) {
    const [fullMatch] = match;
    const matchIndex = match.index ?? 0;
    if (isPartOfUrl(content, matchIndex)) {
      continue; // skip if part of a URL
    }
    let identifier = fullMatch;
    if (!identifier.startsWith("nostr:")) {
      identifier = "nostr:" + identifier;
    }
    const result = await searchEventByIdentifier(identifier);
    if (result.event) {
      const link = createNoteLink(result.event.id);
      processedContent = processedContent.replace(fullMatch, link);
    }
  }

  return processedContent;
}

/**
 * Encodes an event as a nevent string
 */
export function neventEncode(event: NostrEvent, relays: string[] = []): string {
  const client = getNostrClient();
  return client.encoding.encodeNevent({ id: event.id, relays });
}

/**
 * Encodes an event as an naddr string
 */
export function naddrEncode(event: NostrEvent, relays: string[] = []): string {
  const client = getNostrClient();
  const dTag = event.tags.find(tag => tag[0] === 'd')?.[1];
  if (!dTag) throw new Error('Event has no d tag');
  return client.encoding.encodeNaddr({
    kind: event.kind,
    pubkey: event.pubkey,
    identifier: dTag,
    relays,
  });
}

/**
 * Encodes a pubkey as an nprofile string
 */
export function nprofileEncode(pubkey: string, relays: string[] = []): string {
  const client = getNostrClient();
  return client.encoding.encodeNprofile({ pubkey, relays });
}

/**
 * Encodes a note ID as a note string
 */
export function noteEncode(id: string): string {
  const client = getNostrClient();
  return client.encoding.encodeNote(id);
}

/**
 * Encodes a pubkey as an npub string
 */
export function npubEncode(pubkey: string): string {
  const client = getNostrClient();
  return client.encoding.encodeNpub(pubkey);
} 