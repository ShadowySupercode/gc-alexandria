/**
 * Utility functions for highlight management
 */

import type { NDKEvent } from "@nostr-dev-kit/ndk";
import { nip19 } from "nostr-tools";

export interface GroupedHighlight {
  pubkey: string;
  highlights: NDKEvent[];
  count: number;
}

/**
 * Groups highlights by author pubkey
 * Returns a Map with pubkey as key and array of highlights as value
 */
export function groupHighlightsByAuthor(
  highlights: NDKEvent[],
): Map<string, NDKEvent[]> {
  const grouped = new Map<string, NDKEvent[]>();

  for (const highlight of highlights) {
    const pubkey = highlight.pubkey;
    const existing = grouped.get(pubkey) || [];
    existing.push(highlight);
    grouped.set(pubkey, existing);
  }

  return grouped;
}

/**
 * Truncates highlight text to specified length, breaking at word boundaries
 * @param text - The text to truncate
 * @param maxLength - Maximum length (default: 50)
 * @returns Truncated text with ellipsis if needed
 */
export function truncateHighlight(
  text: string,
  maxLength: number = 50,
): string {
  if (!text || text.length <= maxLength) {
    return text;
  }

  // Find the last space before maxLength
  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");

  // If there's a space, break there; otherwise use the full maxLength
  if (lastSpace > 0) {
    return truncated.slice(0, lastSpace) + "...";
  }

  return truncated + "...";
}

/**
 * Encodes a highlight event as an naddr with relay hints
 * @param event - The highlight event (kind 9802)
 * @param relays - Array of relay URLs to include as hints
 * @returns naddr string
 */
export function encodeHighlightNaddr(
  event: NDKEvent,
  relays: string[] = [],
): string {
  try {
    // For kind 9802 highlights, we need the event's unique identifier
    // Since highlights don't have a d-tag, we'll use the event id as nevent instead
    // But per NIP-19, naddr is for addressable events (with d-tag)
    // For non-addressable events like kind 9802, we should use nevent

    const nevent = nip19.neventEncode({
      id: event.id,
      relays: relays.length > 0 ? relays : undefined,
      author: event.pubkey,
      kind: event.kind,
    });

    return nevent;
  } catch (error) {
    console.error("Error encoding highlight naddr:", error);
    // Fallback to just the event id
    return event.id;
  }
}

/**
 * Creates a shortened npub for display
 * @param pubkey - The hex pubkey
 * @param length - Number of characters to show from start (default: 8)
 * @returns Shortened npub like "npub1abc...xyz"
 */
export function shortenNpub(pubkey: string, length: number = 8): string {
  try {
    const npub = nip19.npubEncode(pubkey);
    // npub format: "npub1" + bech32 encoded data
    // Show first part and last part
    if (npub.length <= length + 10) {
      return npub;
    }

    const start = npub.slice(0, length + 5); // "npub1" + first chars
    const end = npub.slice(-4); // last chars
    return `${start}...${end}`;
  } catch (error) {
    console.error("Error creating shortened npub:", error);
    // Fallback to shortened hex
    return `${pubkey.slice(0, 8)}...${pubkey.slice(-4)}`;
  }
}

/**
 * Extracts relay URLs from a highlight event's tags or metadata
 * @param event - The highlight event
 * @returns Array of relay URLs
 */
export function getRelaysFromHighlight(event: NDKEvent): string[] {
  const relays: string[] = [];

  // Check for relay hints in tags (e.g., ["a", "30041:pubkey:id", "relay-url"])
  for (const tag of event.tags) {
    if ((tag[0] === "a" || tag[0] === "e" || tag[0] === "p") && tag[2]) {
      relays.push(tag[2]);
    }
  }

  // Also include relay from the event if available
  if (event.relay?.url) {
    relays.push(event.relay.url);
  }

  // Deduplicate
  return [...new Set(relays)];
}

/**
 * Sorts highlights within a group by creation time (newest first)
 * @param highlights - Array of highlight events
 * @returns Sorted array
 */
export function sortHighlightsByTime(highlights: NDKEvent[]): NDKEvent[] {
  return [...highlights].sort((a, b) => {
    const timeA = a.created_at || 0;
    const timeB = b.created_at || 0;
    return timeB - timeA; // Newest first
  });
}

/**
 * Gets the display name for a highlight author
 * Priority: displayName > name > shortened npub
 */
export function getAuthorDisplayName(
  profile:
    | { name?: string; displayName?: string; display_name?: string }
    | null,
  pubkey: string,
): string {
  if (profile) {
    return profile.displayName || profile.display_name || profile.name ||
      shortenNpub(pubkey);
  }
  return shortenNpub(pubkey);
}
