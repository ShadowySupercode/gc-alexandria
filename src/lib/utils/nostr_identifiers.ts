import { get } from "svelte/store";
import { VALIDATION } from "./search_constants";
import { type NDKEvent, toNpub } from "$lib/utils/nostrUtils.ts";
import { naddrEncode, neventEncode, nprofileEncode } from "$lib/utils.ts";
import { activeInboxRelays } from "$lib/ndk";


/**
 * Nostr identifier types
 */
export type NostrEventId = string; // 64-character hex string
export type NostrCoordinate = string; // kind:pubkey:d-tag format
export type NostrIdentifier = NostrEventId | NostrCoordinate;

/**
 * Interface for parsed Nostr coordinate
 */
export interface ParsedCoordinate {
  kind: number;
  pubkey: string;
  dTag: string;
}

/**
 * Check if a string is a valid hex event ID
 * @param id The string to check
 * @returns True if it's a valid hex event ID
 */
export function isEventId(id: string): id is NostrEventId {
  return new RegExp(`^[a-f0-9]{${VALIDATION.HEX_LENGTH}}$`, "i").test(id);
}

/**
 * Check if a string is a valid Nostr coordinate (kind:pubkey:d-tag)
 * @param coordinate The string to check
 * @returns True if it's a valid coordinate
 */
export function isCoordinate(
  coordinate: string,
): coordinate is NostrCoordinate {
  const parts = coordinate.split(":");
  if (parts.length < 3) return false;

  const [kindStr, pubkey, ...dTagParts] = parts;

  // Check if kind is a valid number
  const kind = parseInt(kindStr, 10);
  if (isNaN(kind) || kind < 0) return false;

  // Check if pubkey is a valid hex string
  if (!isEventId(pubkey)) return false;

  // Check if d-tag exists (can contain colons)
  if (dTagParts.length === 0) return false;

  return true;
}

/**
 * Parse a Nostr coordinate into its components
 * @param coordinate The coordinate string to parse
 * @returns Parsed coordinate or null if invalid
 */
export function parseCoordinate(coordinate: string): ParsedCoordinate | null {
  if (!isCoordinate(coordinate)) return null;

  const parts = coordinate.split(":");
  const [kindStr, pubkey, ...dTagParts] = parts;

  return {
    kind: parseInt(kindStr, 10),
    pubkey,
    dTag: dTagParts.join(":"), // Rejoin in case d-tag contains colons
  };
}

/**
 * Create a coordinate string from components
 * @param kind The event kind
 * @param pubkey The author's public key
 * @param dTag The d-tag value
 * @returns The coordinate string
 */
export function createCoordinate(
  kind: number,
  pubkey: string,
  dTag: string,
): NostrCoordinate {
  return `${kind}:${pubkey}:${dTag}`;
}

/**
 * Check if a string is any valid Nostr identifier
 * @param identifier The string to check
 * @returns True if it's a valid Nostr identifier
 */
export function isNostrIdentifier(
  identifier: string,
): identifier is NostrIdentifier {
  return isEventId(identifier) || isCoordinate(identifier);
}

/**
 * Get various Nostr identifiers for an event
 * @param event
 * @param _profile
 */
export function getIdentifiers(
  event: NDKEvent,
  _profile: any,
): { label: string; value: string; link?: string }[] {
  const ids: { label: string; value: string; link?: string }[] = [];
  const relays = get(activeInboxRelays);

  if (event.kind === 0) {
    // npub
    const npub = toNpub(event.pubkey);
    if (npub)
      ids.push({ label: "npub", value: npub, link: `/events?id=${npub}` });
    // nprofile
    ids.push({
      label: "nprofile",
      value: nprofileEncode(event.pubkey, relays),
      link: `/events?id=${nprofileEncode(event.pubkey, relays)}`,
    });
    // nevent
    ids.push({
      label: "nevent",
      value: neventEncode(event, relays),
      link: `/events?id=${neventEncode(event, relays)}`,
    });
    // hex pubkey - make it clickable to search for the pubkey
    ids.push({ label: "pubkey", value: event.pubkey, link: `/events?n=${event.pubkey}` });
    // hex id - make it a clickable link to search for the event ID
    ids.push({ label: "id", value: event.id, link: `/events?id=${event.id}` });
  } else {
    // nevent
    ids.push({
      label: "nevent",
      value: neventEncode(event, relays),
      link: `/events?id=${neventEncode(event, relays)}`,
    });
    // naddr (if addressable)
    try {
      const naddr = naddrEncode(event, relays);
      ids.push({ label: "naddr", value: naddr, link: `/events?id=${naddr}` });
    } catch {}
    // hex id - make it a clickable link to search for the event ID
    ids.push({ label: "id", value: event.id, link: `/events?id=${event.id}` });
  }
  return ids;
}
