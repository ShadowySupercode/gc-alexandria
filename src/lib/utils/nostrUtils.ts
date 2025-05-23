import { get } from 'svelte/store';
import { nip19 } from 'nostr-tools';
import { ndkInstance } from '$lib/ndk';
import { npubCache } from './npubCache';
import NDK, { NDKEvent, NDKRelaySet, NDKUser } from "@nostr-dev-kit/ndk";
import type { NDKFilter, NDKKind } from "@nostr-dev-kit/ndk";
import { standardRelays, fallbackRelays } from "$lib/consts";
import { NDKRelaySet as NDKRelaySetFromNDK } from '@nostr-dev-kit/ndk';
import { sha256 } from '@noble/hashes/sha256';
import { schnorr } from '@noble/curves/secp256k1';
import { bytesToHex } from '@noble/hashes/utils';

const badgeCheckSvg = '<svg class="w-6 h-6 text-gray-800 dark:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 24 24"><path fill-rule="evenodd" d="M12 2c-.791 0-1.55.314-2.11.874l-.893.893a.985.985 0 0 1-.696.288H7.04A2.984 2.984 0 0 0 4.055 7.04v1.262a.986.986 0 0 1-.288.696l-.893.893a2.984 2.984 0 0 0 0 4.22l.893.893a.985.985 0 0 1 .288.696v1.262a2.984 2.984 0 0 0 2.984 2.984h1.262c.261 0 .512.104.696.288l.893.893a2.984 2.984 0 0 0 4.22 0l.893-.893a.985.985 0 0 1 .696-.288h1.262a2.984 2.984 0 0 0 2.984-2.984V15.7c0-.261.104-.512.288-.696l.893-.893a2.984 2.984 0 0 0 0-4.22l-.893-.893a.985.985 0 0 1-.288-.696V7.04a2.984 2.984 0 0 0-2.984-2.984h-1.262a.985.985 0 0 1-.696-.288l-.893-.893A2.984 2.984 0 0 0 12 2Zm3.683 7.73a1 1 0 1 0-1.414-1.413l-4.253 4.253-1.277-1.277a1 1 0 0 0-1.415 1.414l1.985 1.984a1 1 0 0 0 1.414 0l4.96-4.96Z" clip-rule="evenodd"/></svg>'

const graduationCapSvg = '<svg class="w-6 h-6 text-gray-800 dark:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 24 24"><path d="M12.4472 4.10557c-.2815-.14076-.6129-.14076-.8944 0L2.76981 8.49706l9.21949 4.39024L21 8.38195l-8.5528-4.27638Z"/><path d="M5 17.2222v-5.448l6.5701 3.1286c.278.1325.6016.1293.8771-.0084L19 11.618v5.6042c0 .2857-.1229.5583-.3364.7481l-.0025.0022-.0041.0036-.0103.009-.0119.0101-.0181.0152c-.024.02-.0562.0462-.0965.0776-.0807.0627-.1942.1465-.3405.2441-.2926.195-.7171.4455-1.2736.6928C15.7905 19.5208 14.1527 20 12 20c-2.15265 0-3.79045-.4792-4.90614-.9751-.5565-.2473-.98098-.4978-1.27356-.6928-.14631-.0976-.2598-.1814-.34049-.2441-.04036-.0314-.07254-.0576-.09656-.0776-.01201-.01-.02198-.0185-.02991-.0253l-.01038-.009-.00404-.0036-.00174-.0015-.0008-.0007s-.00004 0 .00978-.0112l-.00009-.0012-.01043.0117C5.12215 17.7799 5 17.5079 5 17.2222Zm-3-6.8765 2 .9523V17c0 .5523-.44772 1-1 1s-1-.4477-1-1v-6.6543Z"/></svg>';

// Regular expressions for Nostr identifiers - match the entire identifier including any prefix
export const NOSTR_PROFILE_REGEX = /(?<![\w/])((nostr:)?(npub|nprofile)[a-zA-Z0-9]{20,})(?![\w/])/g;
export const NOSTR_NOTE_REGEX = /(?<![\w/])((nostr:)?(note|nevent|naddr)[a-zA-Z0-9]{20,})(?![\w/])/g;

export interface NostrProfile {
  name?: string;
  displayName?: string;
  nip05?: string;
  picture?: string;
  about?: string;
  banner?: string;
  website?: string;
  lud16?: string;
}

/**
 * HTML escape a string
 */
function escapeHtml(text: string): string {
  const htmlEscapes: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, char => htmlEscapes[char]);
}

/**
 * Get user metadata for a nostr identifier (npub or nprofile)
 */
export async function getUserMetadata(identifier: string): Promise<NostrProfile> {
  // Remove nostr: prefix if present
  const cleanId = identifier.replace(/^nostr:/, '');
  
  if (npubCache.has(cleanId)) {
    return npubCache.get(cleanId)!;
  }

  const fallback = { name: `${cleanId.slice(0, 8)}...${cleanId.slice(-4)}` };

  try {
    const ndk = get(ndkInstance);
    if (!ndk) {
      npubCache.set(cleanId, fallback);
      return fallback;
    }

    const decoded = nip19.decode(cleanId);
    if (!decoded) {
      npubCache.set(cleanId, fallback);
      return fallback;
    }

    // Handle different identifier types
    let pubkey: string;
    if (decoded.type === 'npub') {
      pubkey = decoded.data;
    } else if (decoded.type === 'nprofile') {
      pubkey = decoded.data.pubkey;
    } else {
      npubCache.set(cleanId, fallback);
      return fallback;
    }

    const profileEvent = await fetchEventWithFallback(ndk, { kinds: [0], authors: [pubkey] });
    const profile = profileEvent && profileEvent.content ? JSON.parse(profileEvent.content) : null;

    const metadata: NostrProfile = {
      name: profile?.name || fallback.name,
      displayName: profile?.displayName,
      nip05: profile?.nip05,
      picture: profile?.image,
      about: profile?.about,
      banner: profile?.banner,
      website: profile?.website,
      lud16: profile?.lud16
    };
    
    npubCache.set(cleanId, metadata);
    return metadata;
  } catch (e) {
    npubCache.set(cleanId, fallback);
    return fallback;
  }
}

/**
 * Create a profile link element
 */
export function createProfileLink(identifier: string, displayText: string | undefined): string {
  const cleanId = identifier.replace(/^nostr:/, '');
  const escapedId = escapeHtml(cleanId);
  const defaultText = `${cleanId.slice(0, 8)}...${cleanId.slice(-4)}`;
  const escapedText = escapeHtml(displayText || defaultText);
  
  return `<a href="./events?id=${escapedId}" class="npub-badge" target="_blank">@${escapedText}</a>`;
}

/**
 * Create a profile link element with a NIP-05 verification indicator.
 */
export async function createProfileLinkWithVerification(identifier: string, displayText: string | undefined): Promise<string> {
  const ndk = get(ndkInstance) as NDK;
  if (!ndk) {
    return createProfileLink(identifier, displayText);
  }

  const cleanId = identifier.replace(/^nostr:/, '');
  const escapedId = escapeHtml(cleanId);
  const isNpub = cleanId.startsWith('npub');

  let user: NDKUser;
  if (isNpub) {
    user = ndk.getUser({ npub: cleanId });
  } else {
    user = ndk.getUser({ pubkey: cleanId });
  }

  const userRelays = Array.from(ndk.pool?.relays.values() || []).map(r => r.url);
  const allRelays = [
    ...standardRelays,
    ...userRelays,
    ...fallbackRelays
  ].filter((url, idx, arr) => arr.indexOf(url) === idx);
  const relaySet = NDKRelaySetFromNDK.fromRelayUrls(allRelays, ndk);
  const profileEvent = await ndk.fetchEvent(
    { kinds: [0], authors: [user.pubkey] },
    undefined,
    relaySet
  );
  const profile = profileEvent?.content ? JSON.parse(profileEvent.content) : null;
  const nip05 = profile?.nip05;

  if (!nip05) {
    return createProfileLink(identifier, displayText);
  }

  const defaultText = `${cleanId.slice(0, 8)}...${cleanId.slice(-4)}`;
  const escapedText = escapeHtml(displayText || defaultText);
  const displayIdentifier = profile?.displayName ?? profile?.name ?? escapedText;

  const isVerified = await user.validateNip05(nip05);
  
  if (!isVerified) {
    return createProfileLink(identifier, displayText);
  }
  
  // TODO: Make this work with an enum in case we add more types.
  const type = nip05.endsWith('edu') ? 'edu' : 'standard';
  switch (type) {
    case 'edu':
      return `<span class="npub-badge"><a href="./events?id=${escapedId}" target="_blank">@${displayIdentifier}</a>${graduationCapSvg}</span>`;
    case 'standard':
      return `<span class="npub-badge"><a href="./events?id=${escapedId}" target="_blank">@${displayIdentifier}</a>${badgeCheckSvg}</span>`;
  }
}
/**
 * Create a note link element
 */
function createNoteLink(identifier: string): string {
  const cleanId = identifier.replace(/^nostr:/, '');
  const shortId = `${cleanId.slice(0, 12)}...${cleanId.slice(-8)}`;
  const escapedId = escapeHtml(cleanId);
  const escapedText = escapeHtml(shortId);
  
  return `<a href="./events?id=${escapedId}" class="inline-flex items-center text-primary-600 dark:text-primary-500 hover:underline break-all" target="_blank">${escapedText}</a>`;
}

/**
 * Process Nostr identifiers in text
 */
export async function processNostrIdentifiers(content: string): Promise<string> {
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
    if (!identifier.startsWith('nostr:')) {
      identifier = 'nostr:' + identifier;
    }
    const metadata = await getUserMetadata(identifier);
    const displayText = metadata.displayName || metadata.name;
    const link = createProfileLink(identifier, displayText);
    processedContent = processedContent.replace(fullMatch, link);
  }

  // Process notes (nevent, note, naddr)
  const noteMatches = Array.from(processedContent.matchAll(NOSTR_NOTE_REGEX));
  for (const match of noteMatches) {
    const [fullMatch] = match;
    const matchIndex = match.index ?? 0;
    if (isPartOfUrl(processedContent, matchIndex)) {
      continue; // skip if part of a URL
    }
    let identifier = fullMatch;
    if (!identifier.startsWith('nostr:')) {
      identifier = 'nostr:' + identifier;
    }
    const link = createNoteLink(identifier);
    processedContent = processedContent.replace(fullMatch, link);
  }

  return processedContent;
}

export async function getNpubFromNip05(nip05: string): Promise<string | null> {
  try {
    const ndk = get(ndkInstance);
    if (!ndk) {
      console.error('NDK not initialized');
      return null;
    }
    
    const user = await ndk.getUser({ nip05 });
    if (!user || !user.npub) {
      return null;
    }
    return user.npub;
  } catch (error) {
    console.error('Error getting npub from nip05:', error);
    return null;
  }
}

/**
 * Generic utility function to add a timeout to any promise
 * Can be used in two ways:
 * 1. Method style: promise.withTimeout(5000)
 * 2. Function style: withTimeout(promise, 5000)
 * 
 * @param thisOrPromise Either the promise to timeout (function style) or the 'this' context (method style)
 * @param timeoutMsOrPromise Timeout duration in milliseconds (function style) or the promise (method style)
 * @returns The promise result if completed before timeout, otherwise throws an error
 * @throws Error with message 'Timeout' if the promise doesn't resolve within timeoutMs
 */
export function withTimeout<T>(
  thisOrPromise: Promise<T> | number,
  timeoutMsOrPromise?: number | Promise<T>
): Promise<T> {
  // Handle method-style call (promise.withTimeout(5000))
  if (typeof thisOrPromise === 'number') {
    const timeoutMs = thisOrPromise;
    const promise = timeoutMsOrPromise as Promise<T>;
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), timeoutMs)
      )
    ]);
  }
  
  // Handle function-style call (withTimeout(promise, 5000))
  const promise = thisOrPromise;
  const timeoutMs = timeoutMsOrPromise as number;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error('Timeout')), timeoutMs)
    )
  ]);
}

// Add the method to Promise prototype
declare global {
  interface Promise<T> {
    withTimeout(timeoutMs: number): Promise<T>;
  }
}

Promise.prototype.withTimeout = function<T>(this: Promise<T>, timeoutMs: number): Promise<T> {
  return withTimeout(timeoutMs, this);
};

/**
 * Fetches an event using a two-step relay strategy:
 * 1. First tries standard relays with timeout
 * 2. Falls back to all relays if not found
 * Always wraps result as NDKEvent
 */
export async function fetchEventWithFallback(
  ndk: NDK,
  filterOrId: string | NDKFilter<NDKKind>,
  timeoutMs: number = 3000
): Promise<NDKEvent | null> {
  // Get user relays if logged in
  const userRelays = ndk.activeUser ? 
    Array.from(ndk.pool?.relays.values() || [])
      .filter(r => r.status === 1) // Only use connected relays
      .map(r => r.url) : 
    [];
  
  // Create three relay sets in priority order
  const relaySets = [
    NDKRelaySetFromNDK.fromRelayUrls(standardRelays, ndk),  // 1. Standard relays
    NDKRelaySetFromNDK.fromRelayUrls(userRelays, ndk),      // 2. User relays (if logged in)
    NDKRelaySetFromNDK.fromRelayUrls(fallbackRelays, ndk)  // 3. fallback relays (last resort)
  ];

  try {
    let found: NDKEvent | null = null;
    const triedRelaySets: string[] = [];

    // Helper function to try fetching from a relay set
    async function tryFetchFromRelaySet(relaySet: NDKRelaySetFromNDK, setName: string): Promise<NDKEvent | null> {
      if (relaySet.relays.size === 0) return null;
      triedRelaySets.push(setName);
      
      if (typeof filterOrId === 'string' && /^[0-9a-f]{64}$/i.test(filterOrId)) {
        return await ndk.fetchEvent({ ids: [filterOrId] }, undefined, relaySet).withTimeout(timeoutMs);
      } else {
        const filter = typeof filterOrId === 'string' ? { ids: [filterOrId] } : filterOrId;
        const results = await ndk.fetchEvents(filter, undefined, relaySet).withTimeout(timeoutMs);
        return results instanceof Set ? Array.from(results)[0] as NDKEvent : null;
      }
    }

    // Try each relay set in order
    for (const [index, relaySet] of relaySets.entries()) {
      const setName = index === 0 ? 'standard relays' : 
                     index === 1 ? 'user relays' : 
                     'fallback relays';
      
      found = await tryFetchFromRelaySet(relaySet, setName);
      if (found) break;
    }

    if (!found) {
      const timeoutSeconds = timeoutMs / 1000;
      const relayUrls = relaySets.map((set, i) => {
        const setName = i === 0 ? 'standard relays' : 
                       i === 1 ? 'user relays' : 
                       'fallback relays';
        const urls = Array.from(set.relays).map(r => r.url);
        return urls.length > 0 ? `${setName} (${urls.join(', ')})` : null;
      }).filter(Boolean).join(', then ');
      
      console.warn(`Event not found after ${timeoutSeconds}s timeout. Tried ${relayUrls}. Some relays may be offline or slow.`);
      return null;
    }

    // Always wrap as NDKEvent
    return found instanceof NDKEvent ? found : new NDKEvent(ndk, found);
  } catch (err) {
    console.error('Error in fetchEventWithFallback:', err);
    return null;
  }
}

/**
 * Converts a hex pubkey to npub, or returns npub if already encoded.
 */
export function toNpub(pubkey: string | undefined): string | null {
  if (!pubkey) return null;
  try {
    if (/^[a-f0-9]{64}$/i.test(pubkey)) {
      return nip19.npubEncode(pubkey);
    }
    if (pubkey.startsWith('npub1')) return pubkey;
    return null;
  } catch {
    return null;
  }
}

export type { NDKEvent, NDKRelaySet, NDKUser };
export { NDKRelaySetFromNDK };
export { nip19 };

export function createRelaySetFromUrls(relayUrls: string[], ndk: NDK) {
  return NDKRelaySetFromNDK.fromRelayUrls(relayUrls, ndk);
}

export function createNDKEvent(ndk: NDK, rawEvent: any) {
  return new NDKEvent(ndk, rawEvent);
}

/**
 * Returns all tags from the event that match the given tag name.
 * @param event The NDKEvent object.
 * @param tagName The tag name to match (e.g., 'a', 'd', 'title').
 * @returns An array of matching tags.
 */
export function getMatchingTags(event: NDKEvent, tagName: string): string[][] {
  return event.tags.filter((tag: string[]) => tag[0] === tagName);
}

export function getEventHash(event: {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
  pubkey: string;
}): string {
  const serialized = JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content
  ]);
  return bytesToHex(sha256(serialized));
}

export async function signEvent(event: {
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