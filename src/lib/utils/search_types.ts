import { NDKEvent } from '@nostr-dev-kit/ndk';

/**
 * Extended NostrProfile interface for search results
 */
export interface NostrProfile {
  name?: string;
  displayName?: string;
  nip05?: string;
  picture?: string;
  about?: string;
  banner?: string;
  website?: string;
  lud16?: string;
  pubkey?: string;
}

/**
 * Search result interface for subscription-based searches
 */
export interface SearchResult {
  events: NDKEvent[];
  secondOrder: NDKEvent[];
  tTagEvents: NDKEvent[];
  eventIds: Set<string>;
  addresses: Set<string>;
  searchType: string;
  searchTerm: string;
}

/**
 * Profile search result interface
 */
export interface ProfileSearchResult {
  profiles: NostrProfile[];
  Status: Record<string, boolean>;
}

/**
 * Search subscription type
 */
export type SearchSubscriptionType = 'd' | 't' | 'n';

/**
 * Search filter configuration
 */
export interface SearchFilter {
  filter: any;
  subscriptionType: string;
}

/**
 * Second-order search parameters
 */
export interface SecondOrderSearchParams {
  searchType: 'n' | 'd';
  firstOrderEvents: NDKEvent[];
  eventIds?: Set<string>;
  addresses?: Set<string>;
  targetPubkey?: string;
}

/**
 * Search callback functions
 */
export interface SearchCallbacks {
  onSecondOrderUpdate?: (result: SearchResult) => void;
  onSubscriptionCreated?: (sub: any) => void;
} 