import { get } from "svelte/store";
import { nip19 } from "nostr-tools";
import { ndkInstance } from "../ndk.ts";
import { npubCache } from "./npubCache.ts";
import NDK, { NDKEvent, NDKRelaySet, NDKUser } from "@nostr-dev-kit/ndk";
import type { NDKKind, NostrEvent } from "@nostr-dev-kit/ndk";
import type { Filter } from "./search_types.ts";
import { communityRelays, secondaryRelays } from "../consts.ts";
import { activeInboxRelays, activeOutboxRelays } from "../ndk.ts";
import { NDKRelaySet as NDKRelaySetFromNDK } from "@nostr-dev-kit/ndk";
import { sha256 } from "@noble/hashes/sha2.js";
import { schnorr } from "@noble/curves/secp256k1";
import { bytesToHex } from "@noble/hashes/utils";
import { wellKnownUrl } from "./search_utility.ts";
import { VALIDATION } from "./search_constants.ts";

const badgeCheckSvg =
  '<svg class="w-6 h-6 text-gray-800 dark:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 24 24"><path fill-rule="evenodd" d="M12 2c-.791 0-1.55.314-2.11.874l-.893.893a.985.985 0 0 1-.696.288H7.04A2.984 2.984 0 0 0 4.055 7.04v1.262a.986.986 0 0 1-.288.696l-.893.893a2.984 2.984 0 0 0 0 4.22l.893.893a.985.985 0 0 1 .288.696v1.262a2.984 2.984 0 0 0 2.984 2.984h1.262c.261 0 .512.104.696.288l.893.893a2.984 2.984 0 0 0 4.22 0l.893-.893a.985.985 0 0 1 .696-.288h1.262a2.984 2.984 0 0 0 2.984-2.984V15.7c0-.261.104-.512.288-.696l.893-.893a2.984 2.984 0 0 0 0-4.22l-.893-.893a.985.985 0 0 1-.288-.696V7.04a2.984 2.984 0 0 0-2.984-2.984h-1.262a.985.985 0 0 1-.696-.288l-.893-.893A2.984 2.984 0 0 0 12 2Zm3.683 7.73a1 1 0 1 0-1.414-1.413l-4.253 4.253-1.277-1.277a1 1 0 0 0-1.415 1.414l1.985 1.984a1 1 0 0 0 1.414 0l4.96-4.96Z" clip-rule="evenodd"/></svg>';

const graduationCapSvg =
  '<svg class="w-6 h-6 text-gray-800 dark:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 24 24"><path d="M12.4472 4.10557c-.2815-.14076-.6129-.14076-.8944 0L2.76981 8.49706l9.21949 4.39024L21 8.38195l-8.5528-4.27638Z"/><path d="M5 17.2222v-5.448l6.5701 3.1286c.278.1325.6016.1293.8771-.0084L19 11.618v5.6042c0 .2857-.1229.5583-.3364.7481l-.0025.0022-.0041.0036-.0103.009-.0119.0101-.0181.0152c-.024.02-.0562.0462-.0965.0776-.0807.0627-.1942.1465-.3405.2441-.2926.195-.7171.4455-1.2736.6928C15.7905 19.5208 14.1527 20 12 20c-2.15265 0-3.79045-.4792-4.90614-.9751-.5565-.2473-.98098-.4978-1.27356-.6928-.14631-.0976-.2598-.1814-.34049-.2441-.04036-.0314-.07254-.0576-.09656-.0776-.01201-.01-.02198-.0185-.02991-.0253l-.01038-.009-.00404-.0036-.00174-.0015-.0008-.0007s-.00004 0 .00978-.0112l-.00009-.0012-.01043.0117C5.12215 17.7799 5 17.5079 5 17.2222Zm-3-6.8765 2 .9523V17c0 .5523-.44772 1-1 1s-1-.4477-1-1v-6.6543Z"/></svg>';

// Regular expressions for Nostr identifiers - match the entire identifier including any prefix
export const NOSTR_PROFILE_REGEX =
  /(?<![\w/])((nostr:)?(npub|nprofile)[a-zA-Z0-9]{20,})(?![\w/])/g;
export const NOSTR_NOTE_REGEX =
  /(?<![\w/])((nostr:)?(note|nevent|naddr)[a-zA-Z0-9]{20,})(?![\w/])/g;

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
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (char) => htmlEscapes[char]);
}

/**
 * Get user metadata for a nostr identifier (npub or nprofile)
 */
export async function getUserMetadata(
  identifier: string,
  force = false,
): Promise<NostrProfile> {
  // Remove nostr: prefix if present
  const cleanId = identifier.replace(/^nostr:/, "");

  console.log("getUserMetadata called with identifier:", identifier, "force:", force);

  if (!force && npubCache.has(cleanId)) {
    const cached = npubCache.get(cleanId)!;
    console.log("getUserMetadata returning cached profile:", cached);
    return cached;
  }

  const fallback = { name: `${cleanId.slice(0, 8)}...${cleanId.slice(-4)}` };

  try {
    const ndk = get(ndkInstance);
    if (!ndk) {
      console.warn("getUserMetadata: No NDK instance available");
      npubCache.set(cleanId, fallback);
      return fallback;
    }

    const decoded = nip19.decode(cleanId);
    if (!decoded) {
      console.warn("getUserMetadata: Failed to decode identifier:", cleanId);
      npubCache.set(cleanId, fallback);
      return fallback;
    }

    // Handle different identifier types
    let pubkey: string;
    if (decoded.type === "npub") {
      pubkey = decoded.data;
    } else if (decoded.type === "nprofile") {
      pubkey = decoded.data.pubkey;
    } else {
      console.warn("getUserMetadata: Unsupported identifier type:", decoded.type);
      npubCache.set(cleanId, fallback);
      return fallback;
    }

    console.log("getUserMetadata: Fetching profile for pubkey:", pubkey);

    const profileEvent = await fetchEventWithFallback(ndk, {
      kinds: [0],
      authors: [pubkey],
    });
    
    console.log("getUserMetadata: Profile event found:", profileEvent);
    
    const profile =
      profileEvent && profileEvent.content
        ? JSON.parse(profileEvent.content)
        : null;

    console.log("getUserMetadata: Parsed profile:", profile);

    const metadata: NostrProfile = {
      name: profile?.name || fallback.name,
      displayName: profile?.displayName || profile?.display_name,
      nip05: profile?.nip05,
      picture: profile?.picture || profile?.image,
      about: profile?.about,
      banner: profile?.banner,
      website: profile?.website,
      lud16: profile?.lud16,
    };

    console.log("getUserMetadata: Final metadata:", metadata);
    npubCache.set(cleanId, metadata);
    return metadata;
  } catch (e) {
    console.error("getUserMetadata: Error fetching profile:", e);
    npubCache.set(cleanId, fallback);
    return fallback;
  }
}

/**
 * Create a profile link element
 */
export function createProfileLink(
  identifier: string,
  displayText: string | undefined,
): string {
  const cleanId = identifier.replace(/^nostr:/, "");
  const escapedId = escapeHtml(cleanId);
  const defaultText = `${cleanId.slice(0, 8)}...${cleanId.slice(-4)}`;
  const escapedText = escapeHtml(displayText || defaultText);

  // Remove target="_blank" for internal navigation
  return `<a href="/events?id=${escapedId}" class="npub-badge">@${escapedText}</a>`;
}

/**
 * Create a profile link element with a NIP-05 verification indicator.
 */
export async function createProfileLinkWithVerification(
  identifier: string,
  displayText: string | undefined,
): Promise<string> {
  const ndk = get(ndkInstance) as NDK;
  if (!ndk) {
    return createProfileLink(identifier, displayText);
  }

  const cleanId = identifier.replace(/^nostr:/, "");
  const escapedId = escapeHtml(cleanId);
  const isNpub = cleanId.startsWith("npub");

  let user: NDKUser;
  if (isNpub) {
    user = ndk.getUser({ npub: cleanId });
  } else {
    user = ndk.getUser({ pubkey: cleanId });
  }

  const userRelays = Array.from(ndk.pool?.relays.values() || []).map(
    (r) => r.url,
  );

  // Filter out problematic relays
  const filterProblematicRelays = (relays: string[]) => {
    return relays.filter((relay) => {
      if (relay.includes("gitcitadel.nostr1.com")) {
        console.info(
          `[nostrUtils.ts] Filtering out problematic relay: ${relay}`,
        );
        return false;
      }
      return true;
    });
  };

  const allRelays = [
    ...communityRelays,
    ...userRelays,
    ...secondaryRelays,
  ].filter((url, idx, arr) => arr.indexOf(url) === idx);

  const filteredRelays = filterProblematicRelays(allRelays);
  const relaySet = NDKRelaySetFromNDK.fromRelayUrls(filteredRelays, ndk);
  const profileEvent = await ndk.fetchEvent(
    { kinds: [0], authors: [user.pubkey] },
    undefined,
    relaySet,
  );
  const profile = profileEvent?.content
    ? JSON.parse(profileEvent.content)
    : null;
  const nip05 = profile?.nip05;

  if (!nip05) {
    return createProfileLink(identifier, displayText);
  }

  const defaultText = `${cleanId.slice(0, 8)}...${cleanId.slice(-4)}`;
  const escapedText = escapeHtml(displayText || defaultText);
  const displayIdentifier =
    profile?.displayName ??
    profile?.display_name ??
    profile?.name ??
    escapedText;

  const isVerified = await user.validateNip05(nip05);

  if (!isVerified) {
    return createProfileLink(identifier, displayText);
  }

  // TODO: Make this work with an enum in case we add more types.
  const type = nip05.endsWith("edu") ? "edu" : "standard";
  switch (type) {
    case "edu":
      return `<span class="npub-badge"><a href="/events?id=${escapedId}">@${displayIdentifier}</a>${graduationCapSvg}</span>`;
    case "standard":
      return `<span class="npub-badge"><a href="/events?id=${escapedId}">@${displayIdentifier}</a>${badgeCheckSvg}</span>`;
  }
}
/**
 * Create a note link element
 */
function createNoteLink(identifier: string): string {
  const cleanId = identifier.replace(/^nostr:/, "");
  const shortId = `${cleanId.slice(0, 12)}...${cleanId.slice(-8)}`;
  const escapedId = escapeHtml(cleanId);
  const escapedText = escapeHtml(shortId);

  return `<a href="/events?id=${escapedId}" class="inline-flex items-center text-primary-600 dark:text-primary-500 hover:underline break-all">${escapedText}</a>`;
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
    if (!identifier.startsWith("nostr:")) {
      identifier = "nostr:" + identifier;
    }
    const link = createNoteLink(identifier);
    processedContent = processedContent.replace(fullMatch, link);
  }

  return processedContent;
}

export async function getNpubFromNip05(nip05: string): Promise<string | null> {
  try {
    // Parse the NIP-05 address
    const [name, domain] = nip05.split("@");
    if (!name || !domain) {
      console.error("[getNpubFromNip05] Invalid NIP-05 format:", nip05);
      return null;
    }

    // Fetch the well-known.json file with timeout and CORS handling
    const url = wellKnownUrl(domain, name);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        mode: "cors",
        headers: {
          Accept: "application/json",
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error(
          "[getNpubFromNip05] HTTP error:",
          response.status,
          response.statusText,
        );
        return null;
      }

      const data = await response.json();

      // Try exact match first
      let pubkey = data.names?.[name];

      // If not found, try case-insensitive search
      if (!pubkey && data.names) {
        const names = Object.keys(data.names);
        const matchingName = names.find(
          (n) => n.toLowerCase() === name.toLowerCase(),
        );
        if (matchingName) {
          pubkey = data.names[matchingName];
          console.log(
            `[getNpubFromNip05] Found case-insensitive match: ${name} -> ${matchingName}`,
          );
        }
      }

      if (!pubkey) {
        console.error("[getNpubFromNip05] No pubkey found for name:", name);
        return null;
      }

      // Convert pubkey to npub
      const npub = nip19.npubEncode(pubkey);
      return npub;
    } catch (fetchError: unknown) {
      clearTimeout(timeoutId);
      if (fetchError instanceof Error && fetchError.name === "AbortError") {
        console.warn("[getNpubFromNip05] Request timeout for:", url);
      } else {
        console.warn("[getNpubFromNip05] CORS or network error for:", url);
      }
      return null;
    }
  } catch (error) {
    console.error("[getNpubFromNip05] Error getting npub from nip05:", error);
    return null;
  }
}

/**
 * Generic utility function to add a timeout to any promise
 * Can be used in two ways:
 * 1. Method style: promise.withTimeout(TIMEOUTS.GENERAL)
 * 2. Function style: withTimeout(promise, TIMEOUTS.GENERAL)
 *
 * @param thisOrPromise Either the promise to timeout (function style) or the 'this' context (method style)
 * @param timeoutMsOrPromise Timeout duration in milliseconds (function style) or the promise (method style)
 * @returns The promise result if completed before timeout, otherwise throws an error
 * @throws Error with message 'Timeout' if the promise doesn't resolve within timeoutMs
 */
export function withTimeout<T>(
  thisOrPromise: Promise<T> | number,
  timeoutMsOrPromise?: number | Promise<T>,
): Promise<T> {
  // Handle method-style call (promise.withTimeout(5000))
  if (typeof thisOrPromise === "number") {
    const timeoutMs = thisOrPromise;
    const promise = timeoutMsOrPromise as Promise<T>;
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), timeoutMs),
      ),
    ]);
  }

  // Handle function-style call (withTimeout(promise, 5000))
  const promise = thisOrPromise;
  const timeoutMs = timeoutMsOrPromise as number;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), timeoutMs),
    ),
  ]);
}

// Add the method to Promise prototype
declare global {
  interface Promise<T> {
    withTimeout(timeoutMs: number): Promise<T>;
  }
}

Promise.prototype.withTimeout = function <T>(
  this: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return withTimeout(timeoutMs, this);
};

// TODO: Implement fetch for no-auth relays using the WebSocketPool and raw WebSockets.
// This fetch function will be used for server-side loading.

/**
 * Fetches an event using a two-step relay strategy:
 * 1. First tries standard relays with timeout
 * 2. Falls back to all relays if not found
 * Always wraps result as NDKEvent
 */
export async function fetchEventWithFallback(
  ndk: NDK,
  filterOrId: string | Filter,
  timeoutMs: number = 3000,
): Promise<NDKEvent | null> {
  // Use both inbox and outbox relays for better event discovery
  const inboxRelays = get(activeInboxRelays);
  const outboxRelays = get(activeOutboxRelays);
  const allRelays = [...inboxRelays, ...outboxRelays];
  
  console.log("fetchEventWithFallback: Using inbox relays:", inboxRelays);
  console.log("fetchEventWithFallback: Using outbox relays:", outboxRelays);
  
  // Check if we have any relays available
  if (allRelays.length === 0) {
    console.warn("fetchEventWithFallback: No relays available for event fetch");
    return null;
  }
  
  // Create relay set from all available relays
  const relaySet = NDKRelaySetFromNDK.fromRelayUrls(allRelays, ndk);

  try {
    if (relaySet.relays.size === 0) {
      console.warn("fetchEventWithFallback: No relays in relay set for event fetch");
      return null;
    }

    console.log("fetchEventWithFallback: Relay set size:", relaySet.relays.size);
    console.log("fetchEventWithFallback: Filter:", filterOrId);
    console.log("fetchEventWithFallback: Relay URLs:", Array.from(relaySet.relays).map((r) => r.url));

    let found: NDKEvent | null = null;

    if (
      typeof filterOrId === "string" &&
      new RegExp(`^[0-9a-f]{${VALIDATION.HEX_LENGTH}}$`, "i").test(filterOrId)
    ) {
      found = await ndk
        .fetchEvent({ ids: [filterOrId] }, undefined, relaySet)
        .withTimeout(timeoutMs);
    } else {
      const filter =
        typeof filterOrId === "string" ? { ids: [filterOrId] } : filterOrId;
      const results = await ndk
        .fetchEvents(filter, undefined, relaySet)
        .withTimeout(timeoutMs);
      found = results instanceof Set
        ? (Array.from(results)[0] as NDKEvent)
        : null;
    }

    if (!found) {
      const timeoutSeconds = timeoutMs / 1000;
      const relayUrls = Array.from(relaySet.relays).map((r) => r.url).join(", ");
      console.warn(
        `fetchEventWithFallback: Event not found after ${timeoutSeconds}s timeout. Tried inbox relays: ${relayUrls}. Some relays may be offline or slow.`,
      );
      return null;
    }

    console.log("fetchEventWithFallback: Found event:", found.id);
    // Always wrap as NDKEvent
    return found instanceof NDKEvent ? found : new NDKEvent(ndk, found);
  } catch (err) {
    if (err instanceof Error && err.message === 'Timeout') {
      const timeoutSeconds = timeoutMs / 1000;
      const relayUrls = Array.from(relaySet.relays).map((r) => r.url).join(", ");
      console.warn(
        `fetchEventWithFallback: Event fetch timed out after ${timeoutSeconds}s. Tried inbox relays: ${relayUrls}. Some relays may be offline or slow.`,
      );
    } else {
      console.error("fetchEventWithFallback: Error in fetchEventWithFallback:", err);
    }
    return null;
  }
}

/**
 * Converts a hex pubkey to npub, or returns npub if already encoded.
 */
export function toNpub(pubkey: string | undefined): string | null {
  if (!pubkey) return null;
  try {
    if (new RegExp(`^[a-f0-9]{${VALIDATION.HEX_LENGTH}}$`, "i").test(pubkey)) {
      return nip19.npubEncode(pubkey);
    }
    if (pubkey.startsWith("npub1")) return pubkey;
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

export function createNDKEvent(ndk: NDK, rawEvent: NDKEvent | NostrEvent | undefined) {
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
    event.content,
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

/**
 * Prefixes Nostr addresses (npub, nprofile, nevent, naddr, note, etc.) with "nostr:"
 * if they are not already prefixed and are not part of a hyperlink
 */
export function prefixNostrAddresses(content: string): string {
  // Regex to match Nostr addresses that are not already prefixed with "nostr:"
  // and are not part of a markdown link or HTML link
  // Must be followed by at least 20 alphanumeric characters to be considered an address
  const nostrAddressPattern =
    /\b(npub|nprofile|nevent|naddr|note)[a-zA-Z0-9]{20,}\b/g;

  return content.replace(nostrAddressPattern, (match, offset) => {
    // Check if this match is part of a markdown link [text](url)
    const beforeMatch = content.substring(0, offset);
    const afterMatch = content.substring(offset + match.length);

    // Check if it's part of a markdown link
    const beforeBrackets = beforeMatch.lastIndexOf("[");
    const afterParens = afterMatch.indexOf(")");

    if (beforeBrackets !== -1 && afterParens !== -1) {
      const textBeforeBrackets = beforeMatch.substring(0, beforeBrackets);
      const lastOpenBracket = textBeforeBrackets.lastIndexOf("[");
      const lastCloseBracket = textBeforeBrackets.lastIndexOf("]");

      // If we have [text] before this, it might be a markdown link
      if (lastOpenBracket !== -1 && lastCloseBracket > lastOpenBracket) {
        return match; // Don't prefix if it's part of a markdown link
      }
    }

    // Check if it's part of an HTML link
    const beforeHref = beforeMatch.lastIndexOf("href=");
    if (beforeHref !== -1) {
      const afterHref = afterMatch.indexOf('"');
      if (afterHref !== -1) {
        return match; // Don't prefix if it's part of an HTML link
      }
    }

    // Check if it's already prefixed with "nostr:"
    const beforeNostr = beforeMatch.lastIndexOf("nostr:");
    if (beforeNostr !== -1) {
      const textAfterNostr = beforeMatch.substring(beforeNostr + 6);
      if (!textAfterNostr.includes(" ")) {
        return match; // Already prefixed
      }
    }

    // Additional check: ensure it's actually a valid Nostr address format
    // The part after the prefix should be a valid bech32 string
    const addressPart = match.substring(4); // Remove npub, nprofile, etc.
    if (addressPart.length < 20) {
      return match; // Too short to be a valid address
    }

    // Check if it looks like a valid bech32 string (alphanumeric, no special chars)
    if (!/^[a-zA-Z0-9]+$/.test(addressPart)) {
      return match; // Not a valid bech32 format
    }

    // Additional check: ensure the word before is not a common word that would indicate
    // this is just a general reference, not an actual address
    const wordBefore = beforeMatch.match(/\b(\w+)\s*$/);
    if (wordBefore) {
      const beforeWord = wordBefore[1].toLowerCase();
      const commonWords = [
        "the",
        "a",
        "an",
        "this",
        "that",
        "my",
        "your",
        "his",
        "her",
        "their",
        "our",
      ];
      if (commonWords.includes(beforeWord)) {
        return match; // Likely just a general reference, not an actual address
      }
    }

    // Prefix with "nostr:"
    return `nostr:${match}`;
  });
}
