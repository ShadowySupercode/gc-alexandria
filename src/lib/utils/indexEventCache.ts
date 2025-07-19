import type { NDKEvent } from "@nostr-dev-kit/ndk";
import { CACHE_DURATIONS, TIMEOUTS } from "./search_constants.ts";

export interface IndexEventCacheEntry {
  events: NDKEvent[];
  timestamp: number;
  relayUrls: string[];
}

class IndexEventCache {
  private cache: Map<string, IndexEventCacheEntry> = new Map();
  private readonly CACHE_DURATION = CACHE_DURATIONS.INDEX_EVENT_CACHE;
  private readonly MAX_CACHE_SIZE = 50; // Maximum number of cached relay combinations

  /**
   * Generate a cache key based on relay URLs
   */
  private generateKey(relayUrls: string[]): string {
    return relayUrls.sort().join("|");
  }

  /**
   * Check if a cached entry is still valid
   */
  private isExpired(entry: IndexEventCacheEntry): boolean {
    return Date.now() - entry.timestamp > this.CACHE_DURATION;
  }

  /**
   * Get cached index events for a set of relays
   */
  get(relayUrls: string[]): NDKEvent[] | null {
    const key = this.generateKey(relayUrls);
    const entry = this.cache.get(key);

    if (!entry || this.isExpired(entry)) {
      if (entry) {
        this.cache.delete(key);
      }
      return null;
    }

    console.log(
      `[IndexEventCache] Using cached index events for ${relayUrls.length} relays`,
    );
    return entry.events;
  }

  /**
   * Store index events in cache
   */
  set(relayUrls: string[], events: NDKEvent[]): void {
    const key = this.generateKey(relayUrls);

    // Implement LRU eviction if cache is full
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      events,
      timestamp: Date.now(),
      relayUrls: [...relayUrls],
    });

    console.log(
      `[IndexEventCache] Cached ${events.length} index events for ${relayUrls.length} relays`,
    );
  }

  /**
   * Check if index events are cached for a set of relays
   */
  has(relayUrls: string[]): boolean {
    const key = this.generateKey(relayUrls);
    const entry = this.cache.get(key);
    return entry !== undefined && !this.isExpired(entry);
  }

  /**
   * Clear expired entries from cache
   */
  cleanup(): void {
    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
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
   * Get cache statistics
   */
  getStats(): {
    size: number;
    totalEvents: number;
    oldestEntry: number | null;
  } {
    let totalEvents = 0;
    let oldestTimestamp: number | null = null;

    for (const entry of this.cache.values()) {
      totalEvents += entry.events.length;
      if (oldestTimestamp === null || entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
      }
    }

    return {
      size: this.cache.size,
      totalEvents,
      oldestEntry: oldestTimestamp,
    };
  }
}

export const indexEventCache = new IndexEventCache();

// Clean up expired entries periodically
setInterval(() => {
  indexEventCache.cleanup();
}, TIMEOUTS.CACHE_CLEANUP); // Check every minute
