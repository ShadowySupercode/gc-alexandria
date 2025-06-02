import type { NostrEvent } from '$lib/types/nostr';

// Re-export NostrEvent for convenience
export type { NostrEvent };

/**
 * Event search result type that matches what fetchEventWithFallback returns
 */
export interface EventSearchResult {
  event: NostrEvent | null;
  relayInfo?: {
    url: string;
    latency: number;
    group: string;
  };
}

/**
 * Interface for Nostr profile metadata
 */
export interface NostrProfile {
  name?: string;
  display_name?: string;
  displayName?: string;
  nip05?: string;
  picture?: string;
  about?: string;
  banner?: string;
  website?: string;
  lud16?: string;
} 