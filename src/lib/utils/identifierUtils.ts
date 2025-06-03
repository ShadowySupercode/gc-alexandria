import type { NostrEvent } from '$lib/types/nostr';
import { getNostrClient } from '$lib/nostr/client';
import type { EventSearchResult } from './types';
import { getUserMetadata } from './profileUtils';
import { createProfileLink } from './profileUtils';
import { createNoteLink } from './profileUtils';
import { get } from 'svelte/store';
import { selectedRelayGroup } from '$lib/utils/relayGroupUtils';
import { bech32 } from '@scure/base';
import { hexToBytes } from '@noble/hashes/utils';
import { documentRelays } from '../consts';

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
    pubkey: event.pubkey,
    kind: event.kind,
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

/**
 * Extracts relay hints from an event (from relays property or r tags).
 */
export function getRelayHints(event: NostrEvent): string[] | undefined {
  // Check for relays property
  if (Array.isArray((event as any).relays) && (event as any).relays.length > 0) {
    return (event as any).relays;
  }
  // Check for 'r' tags
  const rTags = event.tags.filter(tag => tag[0] === 'r').map(tag => tag[1]);
  if (rTags.length > 0) {
    return rTags;
  }
  return undefined;
}

export const NostrEncodingImpl: import('$lib/types/nostr').NostrEncoding = {
  encodeNpub: (pubkey: string): string => {
    const bytes = hexToBytes(pubkey);
    const words = bech32.toWords(bytes);
    return bech32.encode('npub', words);
  },
  encodeNote: (noteId: string): string => {
    // TODO: Implement
    throw new Error('Not implemented');
  },
  encodeNevent: (params: { id: string; relays?: string[] }): string => {
    // TODO: Implement
    throw new Error('Not implemented');
  },
  encodeNprofile: (params: { pubkey: string; relays?: string[] }): string => {
    // TODO: Implement
    throw new Error('Not implemented');
  },
  encodeNaddr: (params: { 
    pubkey: string; 
    kind: number; 
    identifier: string; 
    relays?: string[] 
  }): string => {
    // NIP-19 TLV encoding: 0=pubkey, 1=kind, 2=identifier, 3=relay
    const tlv: number[] = [];
    // pubkey (type 0)
    const pubkeyBytes = hexToBytes(params.pubkey);
    tlv.push(0, pubkeyBytes.length, ...pubkeyBytes);
    // kind (type 1, 4 bytes big-endian)
    const kindBytes = new Uint8Array(4);
    new DataView(kindBytes.buffer).setUint32(0, params.kind, false);
    tlv.push(1, 4, ...kindBytes);
    // identifier (type 2)
    const idBytes = new TextEncoder().encode(params.identifier);
    tlv.push(2, idBytes.length, ...idBytes);
    // Only include the first document relay
    const relay = documentRelays[0];
    if (relay) {
      const relayBytes = new TextEncoder().encode(relay);
      tlv.push(3, relayBytes.length, ...relayBytes);
    }
    const tlvBytes = Uint8Array.from(tlv);
    const words = bech32.toWords(tlvBytes);
    const naddr = bech32.encode('naddr', words);
    if (tlvBytes.length > 90) {
      throw new Error(`naddr TLV payload exceeds 90 bytes (actual: ${tlvBytes.length}). naddr: ${naddr}`);
    }
    return naddr;
  },
  decode: (input: string): {
    type: 'npub' | 'nprofile' | 'note' | 'nevent' | 'naddr';
    data: any;
  } => {
    // Remove nostr: prefix if present
    const clean = input.replace(/^nostr:/, '');
    // @ts-expect-error: bech32.decode prefix type is stricter than needed for NIP-19
    const { prefix, words } = bech32.decode(clean, 2000);
    const data = bech32.fromWords(words);
    switch (prefix) {
      case 'npub': {
        if (data.length !== 32) throw new Error('Invalid npub length');
        return { type: 'npub', data: bytesToHex(data) };
      }
      case 'note': {
        if (data.length !== 32) throw new Error('Invalid note length');
        return { type: 'note', data: bytesToHex(data) };
      }
      case 'nprofile': {
        // TLV: 0=pubkey, 1=relay
        let pubkey;
        let relays: string[] = [];
        let i = 0;
        while (i < data.length) {
          const t = data[i];
          const l = data[i + 1];
          const v = data.slice(i + 2, i + 2 + l);
          if (t === 0) pubkey = bytesToHex(v);
          if (t === 1) relays.push(new TextDecoder().decode(v));
          i += 2 + l;
        }
        if (!pubkey) throw new Error('nprofile missing pubkey');
        return { type: 'nprofile', data: { pubkey, relays } };
      }
      case 'nevent': {
        // TLV: 0=id, 1=relay
        let id;
        let relays: string[] = [];
        let i = 0;
        while (i < data.length) {
          const t = data[i];
          const l = data[i + 1];
          const v = data.slice(i + 2, i + 2 + l);
          if (t === 0) id = bytesToHex(v);
          if (t === 1) relays.push(new TextDecoder().decode(v));
          i += 2 + l;
        }
        if (!id) throw new Error('nevent missing id');
        return { type: 'nevent', data: { id, relays } };
      }
      case 'naddr': {
        // TLV: 0=pubkey, 1=kind, 2=identifier, 3=relay
        let pubkey;
        let kind;
        let identifier;
        let relays: string[] = [];
        let i = 0;
        while (i < data.length) {
          const t = data[i];
          const l = data[i + 1];
          const v = data.slice(i + 2, i + 2 + l);
          if (t === 0) pubkey = bytesToHex(v);
          if (t === 1) kind = new DataView(Uint8Array.from(v).buffer).getUint32(0, false);
          if (t === 2) identifier = new TextDecoder().decode(v);
          if (t === 3) relays.push(new TextDecoder().decode(v));
          i += 2 + l;
        }
        if (!pubkey || kind === undefined || !identifier) throw new Error('naddr missing fields');
        return { type: 'naddr', data: { pubkey, kind, identifier, relays } };
      }
      default:
        throw new Error(`Unknown NIP-19 prefix: ${prefix}`);
    }
  },
};

// Utility to convert bytes to hex
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
} 