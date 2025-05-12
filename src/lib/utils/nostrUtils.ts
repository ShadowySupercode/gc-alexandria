import { get } from 'svelte/store';
import { nip19 } from 'nostr-tools';
import { ndkInstance } from '$lib/ndk';

// Regular expressions for Nostr identifiers - match the entire identifier including any prefix
export const NOSTR_PROFILE_REGEX = /(?<![\w/])((nostr:)?(npub|nprofile)[a-zA-Z0-9]{20,})(?![\w/])/g;
export const NOSTR_NOTE_REGEX = /(?<![\w/])((nostr:)?(note|nevent|naddr)[a-zA-Z0-9]{20,})(?![\w/])/g;

// Cache for npub metadata
const npubCache = new Map<string, {name?: string, displayName?: string}>();

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
export async function getUserMetadata(identifier: string): Promise<{name?: string, displayName?: string}> {
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
        displayName: profile.displayName
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
  
  return `<a href="https://njump.me/${escapedId}" class="inline-flex items-center text-primary-600 dark:text-primary-500 hover:underline" target="_blank">@${escapedText}</a>`;
}

/**
 * Create a note link element
 */
function createNoteLink(identifier: string): string {
  const cleanId = identifier.replace(/^nostr:/, '');
  const shortId = `${cleanId.slice(0, 12)}...${cleanId.slice(-8)}`;
  const escapedId = escapeHtml(cleanId);
  const escapedText = escapeHtml(shortId);
  
  return `<a href="https://njump.me/${escapedId}" class="inline-flex items-center text-primary-600 dark:text-primary-500 hover:underline break-all" target="_blank">${escapedText}</a>`;
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