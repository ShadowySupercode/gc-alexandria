import { VALIDATION } from './search_constants';

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
  return new RegExp(`^[a-f0-9]{${VALIDATION.HEX_LENGTH}}$`, 'i').test(id);
}

/**
 * Check if a string is a valid Nostr coordinate (kind:pubkey:d-tag)
 * @param coordinate The string to check
 * @returns True if it's a valid coordinate
 */
export function isCoordinate(coordinate: string): coordinate is NostrCoordinate {
  const parts = coordinate.split(':');
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
  
  const parts = coordinate.split(':');
  const [kindStr, pubkey, ...dTagParts] = parts;
  
  return {
    kind: parseInt(kindStr, 10),
    pubkey,
    dTag: dTagParts.join(':') // Rejoin in case d-tag contains colons
  };
}

/**
 * Create a coordinate string from components
 * @param kind The event kind
 * @param pubkey The author's public key
 * @param dTag The d-tag value
 * @returns The coordinate string
 */
export function createCoordinate(kind: number, pubkey: string, dTag: string): NostrCoordinate {
  return `${kind}:${pubkey}:${dTag}`;
}

/**
 * Check if a string is any valid Nostr identifier
 * @param identifier The string to check
 * @returns True if it's a valid Nostr identifier
 */
export function isNostrIdentifier(identifier: string): identifier is NostrIdentifier {
  return isEventId(identifier) || isCoordinate(identifier);
} 