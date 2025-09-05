import type { NDKEvent } from "@nostr-dev-kit/ndk";
import { CACHE_DURATIONS, TIMEOUTS } from "./search_constants.ts";
import { unifiedProfileCache } from "./npubCache.ts";

export interface SearchResult {
  events: NDKEvent[];
  secondOrder: NDKEvent[];
  tTagEvents: NDKEvent[];
  eventIds: Set<string>;
  addresses: Set<string>;
  searchType: string;
  searchTerm: string;
  timestamp: number;
  // AI-NOTE: For profile searches, store identifiers instead of duplicating events
  profileIdentifiers?: string[]; // Store npub/pubkey identifiers for profile searches
}

class SearchCache {
  private cache: Map<string, SearchResult> = new Map();
  private readonly CACHE_DURATION = CACHE_DURATIONS.SEARCH_CACHE;

  /**
   * Generate a cache key for a search
   */
  private generateKey(searchType: string, searchTerm: string): string {
    if (!searchTerm) {
      return `${searchType}:`;
    }
    return `${searchType}:${searchTerm.toLowerCase().trim()}`;
  }

  /**
   * Check if a cached result is still valid
   */
  private isExpired(result: SearchResult): boolean {
    return Date.now() - result.timestamp > this.CACHE_DURATION;
  }

  /**
   * Get cached search results
   */
  get(searchType: string, searchTerm: string): SearchResult | null {
    const key = this.generateKey(searchType, searchTerm);
    const result = this.cache.get(key);

    if (!result || this.isExpired(result)) {
      if (result) {
        this.cache.delete(key);
      }
      return null;
    }

    return result;
  }

  /**
   * Store search results in cache
   */
  set(
    searchType: string,
    searchTerm: string,
    result: Omit<SearchResult, "timestamp">,
  ): void {
    const key = this.generateKey(searchType, searchTerm);
    this.cache.set(key, {
      ...result,
      timestamp: Date.now(),
    });
  }

  /**
   * Check if a search result is cached and valid
   */
  has(searchType: string, searchTerm: string): boolean {
    const key = this.generateKey(searchType, searchTerm);
    const result = this.cache.get(key);
    return result !== undefined && !this.isExpired(result);
  }

  /**
   * Clear expired entries from cache
   */
  cleanup(): void {
    for (const [key, result] of this.cache.entries()) {
      if (this.isExpired(result)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Resolve profile identifiers to actual events using UnifiedProfileCache
   * This eliminates data duplication by using the centralized profile cache
   */
  resolveProfileEvents(result: SearchResult): SearchResult {
    if (result.searchType === 'profile' && result.profileIdentifiers) {
      const resolvedEvents = unifiedProfileCache.getCachedEvents(result.profileIdentifiers);
      
      // Update the result with resolved events
      return {
        ...result,
        events: resolvedEvents,
        profileIdentifiers: undefined, // Clear identifiers since we have resolved events
      };
    }
    
    return result;
  }
}

export const searchCache = new SearchCache();

// Clean up expired entries periodically
setInterval(() => {
  searchCache.cleanup();
}, TIMEOUTS.CACHE_CLEANUP); // Check every minute
