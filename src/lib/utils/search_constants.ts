/**
 * Search and Event Utility Constants
 *
 * This file centralizes all magic numbers used throughout the search and event utilities
 * to improve maintainability and reduce code duplication.
 */

import { NostrKind } from "../types.ts";

// Event type constants
export const EVENT_TYPES = {
  /** Regular events - all expected to be stored by relays */
  REGULAR: "regular",
  /** Replaceable events - only latest stored by relays */
  REPLACEABLE: "replaceable",
  /** Ephemeral events - not expected to be stored by relays */
  EPHEMERAL: "ephemeral",
  /** Addressable events - latest per d-tag stored by relays */
  ADDRESSABLE: "addressable",
} as const;

export type EventType = typeof EVENT_TYPES[keyof typeof EVENT_TYPES];

// Timeout constants (in milliseconds)
export const TIMEOUTS = {
  /** Default timeout for event fetching operations */
  EVENT_FETCH: 10000,

  /** Timeout for profile search operations */
  PROFILE_SEARCH: 15000,

  /** Timeout for subscription search operations */
  SUBSCRIPTION_SEARCH: 10000,

  /** Timeout for second-order search operations */
  SECOND_ORDER_SEARCH: 3000, // AI-NOTE: 2025-01-24 - Reduced timeout since we limit scope

  /** Timeout for relay diagnostics */
  RELAY_DIAGNOSTICS: 5000,

  /** Timeout for general operations */
  GENERAL: 5000,

  /** Cache cleanup interval */
  CACHE_CLEANUP: 60000,

  /** Timeout for relay search operations */
  RELAY_TIMEOUT: 1500, // 1.5 seconds for quick relay searches
} as const;

// Cache duration constants (in milliseconds)
export const CACHE_DURATIONS = {
  /** Default cache duration for search results */
  SEARCH_CACHE: 5 * 60 * 1000, // 5 minutes

  /** Cache duration for index events */
  INDEX_EVENT_CACHE: 10 * 60 * 1000, // 10 minutes
} as const;

// Search limits
export const SEARCH_LIMITS = {
  /** Limit for specific profile searches (npub, NIP-05) */
  SPECIFIC_PROFILE: 10,

  /** Limit for general profile searches */
  GENERAL_PROFILE: 100, // AI-NOTE: 2025-01-24 - Reduced from 500 to prevent wild searches

  /** Limit for general content searches (t-tag, d-tag, etc.) */
  GENERAL_CONTENT: 100, // AI-NOTE: 2025-01-24 - Added limit for all content searches

  /** Limit for community relay checks */
  COMMUNITY_CHECK: 1,

  /** Limit for second-order search results */
  SECOND_ORDER_RESULTS: 100,

  /** Maximum results for profile searches */
  MAX_PROFILE_RESULTS: 20,

  /** Batch size for profile fetching operations */
  BATCH_SIZE: 50,
} as const;

// Nostr event kind ranges according to NIP specification
export const EVENT_KINDS = {
  /** Replaceable event kinds (0, 3, 10000-19999) - only latest stored by relays */
  REPLACEABLE: {
    MIN: 10000,
    MAX: 19999,
    SPECIFIC: [NostrKind.UserMetadata, NostrKind.ContactList],
  },

  /** Ephemeral event kinds (20000-29999) - not expected to be stored by relays */
  EPHEMERAL: {
    MIN: 20000,
    MAX: 29999,
  },

  /** Addressable event kinds (30000-39999) - latest per d-tag stored by relays */
  ADDRESSABLE: {
    MIN: 30000,
    MAX: 39999,
  },

} as const;

/**
 * Determine the type of Nostr event based on its kind number
 * Following NIP specification for kind ranges:
 * - Replaceable: 0, 3, 10000-19999 (only latest stored)
 * - Ephemeral: 20000-29999 (not stored)
 * - Addressable: 30000-39999 (latest per d-tag stored)
 * - Regular: all other kinds (stored by relays)
 */
export function getEventType(kind: number): EventType {
  // Check addressable events first (30000-39999)
  if (
    kind >= EVENT_KINDS.ADDRESSABLE.MIN &&
    kind < EVENT_KINDS.ADDRESSABLE.MAX
  ) {
    return EVENT_TYPES.ADDRESSABLE;
  }

  // Check ephemeral events (20000-29999)
  if (
    kind >= EVENT_KINDS.EPHEMERAL.MIN &&
    kind < EVENT_KINDS.EPHEMERAL.MAX
  ) {
    return EVENT_TYPES.EPHEMERAL;
  }

  // Check replaceable events (0, 3, 10000-19999)
  if (
    (kind >= EVENT_KINDS.REPLACEABLE.MIN &&
      kind < EVENT_KINDS.REPLACEABLE.MAX) ||
    EVENT_KINDS.REPLACEABLE.SPECIFIC.includes(kind as NostrKind.UserMetadata | NostrKind.ContactList)
  ) {
    return EVENT_TYPES.REPLACEABLE;
  }

  // Everything else is regular
  return EVENT_TYPES.REGULAR;
}

// Relay-specific constants
export const RELAY_CONSTANTS = {
  /** Request ID for community relay checks */
  COMMUNITY_REQUEST_ID: "alexandria-forest",

  /** Default relay request kinds for community checks */
  COMMUNITY_REQUEST_KINDS: [1],
} as const;

// Time constants
export const TIME_CONSTANTS = {
  /** Unix timestamp conversion factor (seconds to milliseconds) */
  UNIX_TIMESTAMP_FACTOR: 1000,

  /** Current timestamp in seconds */
  CURRENT_TIMESTAMP: Math.floor(Date.now() / 1000),
} as const;

// Validation constants
export const VALIDATION = {
  /** Hex string length for event IDs and pubkeys */
  HEX_LENGTH: 64,

  /** Minimum length for Nostr identifiers */
  MIN_NOSTR_IDENTIFIER_LENGTH: 4,
} as const;

// HTTP status codes
export const HTTP_STATUS = {
  /** OK status code */
  OK: 200,

  /** Not found status code */
  NOT_FOUND: 404,

  /** Internal server error status code */
  INTERNAL_SERVER_ERROR: 500,
} as const;
