import { get } from 'svelte/store';
import { nip19 } from 'nostr-tools';
import { ndkInstance } from '$lib/ndk';
import { npubCache } from './npubCache';
import NDK, { NDKEvent, NDKRelaySet } from "@nostr-dev-kit/ndk";
import type { NDKFilter, NDKKind } from "@nostr-dev-kit/ndk";
import { standardRelays, fallbackRelays } from "$lib/consts";

// Regular expressions for Nostr identifiers - match the entire identifier including any prefix
export const NOSTR_PROFILE_REGEX = /(?<![\w/])((nostr:)?(npub|nprofile)[a-zA-Z0-9]{20,})(?![\w/])/g;
export const NOSTR_NOTE_REGEX = /(?<![\w/])((nostr:)?(note|nevent|naddr)[a-zA-Z0-9]{20,})(?![\w/])/g;

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
export async function getUserMetadata(identifier: string): Promise<{name?: string, displayName?: string, nip05?: string}> {
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

    const user = ndk.getUser({ pubkey: pubkey });
    if (!user) {
      npubCache.set(cleanId, fallback);
      return fallback;
    }

    try {
      const profile = await user.fetchProfile();
      if (!profile) {
        npubCache.set(cleanId, fallback);
        return fallback;
      }

      const metadata = {
        name: profile.name || fallback.name,
        displayName: profile.displayName,
        nip05: profile.nip05
      };
      
      npubCache.set(cleanId, metadata);
      return metadata;
    } catch (e) {
      npubCache.set(cleanId, fallback);
      return fallback;
    }
  } catch (e) {
    npubCache.set(cleanId, fallback);
    return fallback;
  }
}

/**
 * Create a profile link element
 */
function createProfileLink(identifier: string, displayText: string | undefined): string {
  const cleanId = identifier.replace(/^nostr:/, '');
  const escapedId = escapeHtml(cleanId);
  const defaultText = `${cleanId.slice(0, 8)}...${cleanId.slice(-4)}`;
  const escapedText = escapeHtml(displayText || defaultText);
  
  return `<a href="./events?id=${escapedId}" class="inline-flex items-center text-primary-600 dark:text-primary-500 hover:underline" target="_blank">@${escapedText}</a>`;
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
    NDKRelaySet.fromRelayUrls(standardRelays, ndk),  // 1. Standard relays
    NDKRelaySet.fromRelayUrls(userRelays, ndk),      // 2. User relays (if logged in)
    NDKRelaySet.fromRelayUrls(fallbackRelays, ndk)  // 3. fallback relays (last resort)
  ];

  try {
    let found: NDKEvent | null = null;
    const triedRelaySets: string[] = [];

    // Helper function to try fetching from a relay set
    async function tryFetchFromRelaySet(relaySet: NDKRelaySet, setName: string): Promise<NDKEvent | null> {
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