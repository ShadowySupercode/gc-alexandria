/**
 * Search and Event Utility Constants
 *
 * This file centralizes all magic numbers used throughout the search and event utilities
 * to improve maintainability and reduce code duplication.
 */

// Timeout constants (in milliseconds)
export const TIMEOUTS = {
  /** Default timeout for event fetching operations */
  EVENT_FETCH: 10000,

  /** Timeout for profile search operations */
  PROFILE_SEARCH: 15000,

  /** Timeout for subscription search operations */
  SUBSCRIPTION_SEARCH: 10000,

  /** Timeout for second-order search operations */
  SECOND_ORDER_SEARCH: 5000,

  /** Timeout for relay diagnostics */
  RELAY_DIAGNOSTICS: 5000,

  /** Timeout for general operations */
  GENERAL: 5000,

  /** Cache cleanup interval */
  CACHE_CLEANUP: 60000,
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
  GENERAL_PROFILE: 500,

  /** Limit for community relay checks */
  COMMUNITY_CHECK: 1,

  /** Limit for second-order search results */
  SECOND_ORDER_RESULTS: 100,
} as const;

// Nostr event kind ranges
export const EVENT_KINDS = {
  /** Replaceable event kinds (0, 3, 10000-19999) */
  REPLACEABLE: {
    MIN: 0,
    MAX: 19999,
    SPECIFIC: [0, 3],
  },

  /** Parameterized replaceable event kinds (20000-29999) */
  PARAMETERIZED_REPLACEABLE: {
    MIN: 20000,
    MAX: 29999,
  },

  /** Addressable event kinds (30000-39999) */
  ADDRESSABLE: {
    MIN: 30000,
    MAX: 39999,
  },

  /** Comment event kind */
  COMMENT: 1111,

  /** Text note event kind */
  TEXT_NOTE: 1,

  /** Profile metadata event kind */
  PROFILE_METADATA: 0,
} as const;

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
