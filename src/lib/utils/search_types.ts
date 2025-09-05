import { NDKEvent, NDKSubscription } from "@nostr-dev-kit/ndk";

/**
 * Nostr filter interface
 */
export interface Filter {
  ids?: string[];
  authors?: string[];
  kinds?: number[];
  since?: number;
  until?: number;
  limit?: number;
  search?: string;
  [key: string]: any;
}

/**
 * Extended NostrProfile interface for search results
 */
export interface NostrProfile {
  name?: string[];
  displayName?: string[];
  display_name?: string[]; // AI-NOTE:  Added for compatibility with existing code
  nip05?: string[];
  picture?: string[];
  about?: string[];
  banner?: string[];
  website?: string[];
  lud16?: string[];
  pubkey?: string;
  isInUserLists?: boolean;
  listKinds?: number[];
  created_at?: number; // AI-NOTE:  Timestamp for proper date display
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
export type SearchSubscriptionType = "d" | "t" | "n";

/**
 * Search filter configuration
 */
export interface SearchFilter {
  filter: Filter;
  subscriptionType: string;
  searchTerm?: string; // AI-NOTE:  Optional search term for client-side filtering
  preloadedEvents?: NDKEvent[]; // AI-NOTE:  Preloaded events for profile searches
}

/**
 * Second-order search parameters
 */
export interface SecondOrderSearchParams {
  searchType: "n" | "d";
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
  onSubscriptionCreated?: (sub: NDKSubscription) => void;
}
