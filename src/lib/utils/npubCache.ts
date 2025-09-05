import type { NostrProfile } from "./search_types";
import NDK, { NDKEvent } from "@nostr-dev-kit/ndk";
import { fetchEventWithFallback } from "./nostrUtils";
import { nip19 } from "nostr-tools";

export type NpubMetadata = NostrProfile;

interface CacheEntry {
  profile: NpubMetadata;
  timestamp: number;
  pubkey: string;
  relaySource?: string;
  originalEvent?: NDKEvent; // AI-NOTE: Store the original event to preserve id field
}

class UnifiedProfileCache {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly storageKey = "alexandria_unified_profile_cache";
  private readonly maxAge = 2 * 60 * 60 * 1000; // 2 hours in milliseconds - shorter for fresher data

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      if (typeof window !== "undefined") {
        const stored = localStorage.getItem(this.storageKey);
        if (stored) {
          const data = JSON.parse(stored) as Record<string, CacheEntry>;
          const now = Date.now();

          // Filter out expired entries
          for (const [key, entry] of Object.entries(data)) {
            if (entry.timestamp && (now - entry.timestamp) < this.maxAge) {
              this.cache.set(key, entry);
            }
          }
        }
      }
    } catch (error) {
      console.warn("Failed to load unified profile cache from storage:", error);
    }
  }

  private saveToStorage(): void {
    try {
      if (typeof window !== "undefined") {
        const data: Record<string, CacheEntry> = {};
        for (const [key, entry] of this.cache.entries()) {
          data[key] = entry;
        }
        localStorage.setItem(this.storageKey, JSON.stringify(data));
      }
    } catch (error) {
      console.warn("Failed to save unified profile cache to storage:", error);
    }
  }

  /**
   * Get profile data, fetching fresh data if needed
   */
  async getProfile(identifier: string, ndk?: NDK, force = false): Promise<NpubMetadata> {
    const cleanId = identifier.replace(/^nostr:/, "");
    
    // Check cache first (unless forced)
    if (!force && this.cache.has(cleanId)) {
      const entry = this.cache.get(cleanId)!;
      const now = Date.now();
      
      // Return cached data if not expired
      if ((now - entry.timestamp) < this.maxAge) {
        console.log("UnifiedProfileCache: Returning cached profile:", cleanId);
        return entry.profile;
      }
    }

    // Fetch fresh data
    return this.fetchAndCacheProfile(cleanId, ndk);
  }

  /**
   * Fetch profile from all available relays and cache it
   */
  private async fetchAndCacheProfile(identifier: string, ndk?: NDK): Promise<NpubMetadata> {
    const fallback = { name: `${identifier.slice(0, 8)}...${identifier.slice(-4)}` };

    try {
      if (!ndk) {
        console.warn("UnifiedProfileCache: No NDK instance available");
        return fallback;
      }

      const decoded = nip19.decode(identifier);
      if (!decoded) {
        console.warn("UnifiedProfileCache: Failed to decode identifier:", identifier);
        return fallback;
      }

      // Handle different identifier types
      let pubkey: string;
      if (decoded.type === "npub") {
        pubkey = decoded.data;
      } else if (decoded.type === "nprofile") {
        pubkey = decoded.data.pubkey;
      } else {
        console.warn("UnifiedProfileCache: Unsupported identifier type:", decoded.type);
        return fallback;
      }

      console.log("UnifiedProfileCache: Fetching fresh profile for pubkey:", pubkey);

      // Use fetchEventWithFallback to search ALL available relays
      const profileEvent = await fetchEventWithFallback(ndk, {
        kinds: [0],
        authors: [pubkey],
      });

      if (!profileEvent || !profileEvent.content) {
        console.warn("UnifiedProfileCache: No profile event found for:", pubkey);
        return fallback;
      }

      const profile = JSON.parse(profileEvent.content);
      const metadata: NostrProfile = {
        name: profile?.name || fallback.name,
        displayName: profile?.displayName || profile?.display_name,
        display_name: profile?.display_name || profile?.displayName, // AI-NOTE:  Added for compatibility
        nip05: profile?.nip05,
        picture: profile?.picture || profile?.image,
        about: profile?.about,
        banner: profile?.banner,
        website: profile?.website,
        lud16: profile?.lud16,
      };

      // Cache the fresh data including the original event
      const entry: CacheEntry = {
        profile: metadata,
        timestamp: Date.now(),
        pubkey: pubkey,
        relaySource: profileEvent.relay?.url,
        originalEvent: profileEvent, // AI-NOTE: Store the original event to preserve id field
      };

      this.cache.set(identifier, entry);
      this.cache.set(pubkey, entry); // Also cache by pubkey for convenience
      this.saveToStorage();

      console.log("UnifiedProfileCache: Cached fresh profile:", metadata, "with event id:", profileEvent.id);
      return metadata;

    } catch (e) {
      console.error("UnifiedProfileCache: Error fetching profile:", e);
      return fallback;
    }
  }

  /**
   * Get cached profile without fetching (synchronous)
   */
  getCached(identifier: string): NpubMetadata | undefined {
    const cleanId = identifier.replace(/^nostr:/, "");
    const entry = this.cache.get(cleanId);
    
    if (entry) {
      const now = Date.now();
      if ((now - entry.timestamp) < this.maxAge) {
        return entry.profile;
      } else {
        // Remove expired entry
        this.cache.delete(cleanId);
      }
    }
    
    return undefined;
  }

  /**
   * Get the original cached event (including id field) without fetching
   */
  getCachedEvent(identifier: string): NDKEvent | undefined {
    const cleanId = identifier.replace(/^nostr:/, "");
    const entry = this.cache.get(cleanId);
    
    if (entry) {
      const now = Date.now();
      if ((now - entry.timestamp) < this.maxAge) {
        return entry.originalEvent;
      } else {
        // Remove expired entry
        this.cache.delete(cleanId);
      }
    }
    
    return undefined;
  }

  /**
   * Get multiple cached events by identifiers
   * Used by profile search to get complete events with id fields
   */
  getCachedEvents(identifiers: string[]): NDKEvent[] {
    const events: NDKEvent[] = [];
    
    for (const identifier of identifiers) {
      const event = this.getCachedEvent(identifier);
      if (event) {
        events.push(event);
      }
    }
    
    return events;
  }

  /**
   * Check if all identifiers have cached events with complete data
   */
  hasCompleteEvents(identifiers: string[]): boolean {
    return identifiers.every(identifier => {
      const event = this.getCachedEvent(identifier);
      return event && event.id && event.pubkey && event.content;
    });
  }

  /**
   * Set profile data in cache
   */
  set(identifier: string, profile: NpubMetadata, pubkey?: string, relaySource?: string): void {
    const cleanId = identifier.replace(/^nostr:/, "");
    const entry: CacheEntry = {
      profile,
      timestamp: Date.now(),
      pubkey: pubkey || cleanId,
      relaySource,
    };

    this.cache.set(cleanId, entry);
    if (pubkey && pubkey !== cleanId) {
      this.cache.set(pubkey, entry);
    }
    this.saveToStorage();
  }

  /**
   * Update the original event for an existing cache entry
   */
  updateOriginalEvent(identifier: string, originalEvent: NDKEvent): void {
    const cleanId = identifier.replace(/^nostr:/, "");
    const entry = this.cache.get(cleanId);
    
    if (entry) {
      entry.originalEvent = originalEvent;
      this.cache.set(cleanId, entry);
      
      // Also update by pubkey if different
      if (entry.pubkey && entry.pubkey !== cleanId) {
        this.cache.set(entry.pubkey, entry);
      }
      
      this.saveToStorage();
      console.log("UnifiedProfileCache: Updated original event for:", cleanId, "with id:", originalEvent.id);
    }
  }

  /**
   * Check if profile is cached and valid
   */
  has(identifier: string): boolean {
    const cleanId = identifier.replace(/^nostr:/, "");
    const entry = this.cache.get(cleanId);
    
    if (entry) {
      const now = Date.now();
      if ((now - entry.timestamp) < this.maxAge) {
        return true;
      } else {
        // Remove expired entry
        this.cache.delete(cleanId);
      }
    }
    
    return false;
  }

  /**
   * Remove profile from cache
   */
  delete(identifier: string): boolean {
    const cleanId = identifier.replace(/^nostr:/, "");
    const entry = this.cache.get(cleanId);
    
    if (entry) {
      this.cache.delete(cleanId);
      if (entry.pubkey && entry.pubkey !== cleanId) {
        this.cache.delete(entry.pubkey);
      }
      this.saveToStorage();
      return true;
    }
    
    return false;
  }

  /**
   * Clear all cached profiles
   */
  clear(): void {
    this.cache.clear();
    this.saveToStorage();
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Get all cached profiles
   */
  getAll(): Record<string, NpubMetadata> {
    const result: Record<string, NpubMetadata> = {};
    for (const [key, entry] of this.cache.entries()) {
      result[key] = entry.profile;
    }
    return result;
  }

  /**
   * Clean up expired entries
   */
  cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];
    
    for (const [key, entry] of this.cache.entries()) {
      if ((now - entry.timestamp) >= this.maxAge) {
        expiredKeys.push(key);
      }
    }
    
    expiredKeys.forEach(key => this.cache.delete(key));
    
    if (expiredKeys.length > 0) {
      this.saveToStorage();
      console.log(`UnifiedProfileCache: Cleaned up ${expiredKeys.length} expired entries`);
    }
  }
}

// Export the unified cache instance
export const unifiedProfileCache = new UnifiedProfileCache();

// Clean up expired entries every 30 minutes
if (typeof window !== "undefined") {
  setInterval(() => {
    unifiedProfileCache.cleanup();
  }, 30 * 60 * 1000);
}

// Legacy compatibility - keep the old npubCache for backward compatibility
// but make it use the unified cache internally
export const npubCache = {
  get: (key: string) => unifiedProfileCache.getCached(key),
  set: (key: string, value: NpubMetadata) => unifiedProfileCache.set(key, value),
  has: (key: string) => unifiedProfileCache.has(key),
  delete: (key: string) => unifiedProfileCache.delete(key),
  clear: () => unifiedProfileCache.clear(),
  size: () => unifiedProfileCache.size(),
  getAll: () => unifiedProfileCache.getAll(),
};

// Legacy compatibility for old profileCache functions
export async function getDisplayName(pubkey: string, ndk: NDK): Promise<string> {
  const profile = await unifiedProfileCache.getProfile(pubkey, ndk);
  return profile.displayName || profile.name || `${pubkey.slice(0, 8)}...${pubkey.slice(-4)}`;
}

export function getDisplayNameSync(pubkey: string): string {
  const profile = unifiedProfileCache.getCached(pubkey);
  return profile?.displayName || profile?.name || `${pubkey.slice(0, 8)}...${pubkey.slice(-4)}`;
}

export async function batchFetchProfiles(
  pubkeys: string[],
  ndk: NDK,
  onProgress?: (fetched: number, total: number) => void,
): Promise<NDKEvent[]> {
  const allProfileEvents: NDKEvent[] = [];
  
  if (onProgress) onProgress(0, pubkeys.length);
  
  // Fetch profiles in parallel using the unified cache
  const fetchPromises = pubkeys.map(async (pubkey, index) => {
    try {
      const profile = await unifiedProfileCache.getProfile(pubkey, ndk);
      if (onProgress) onProgress(index + 1, pubkeys.length);
      
      // Create a mock NDKEvent for compatibility
      const event = new NDKEvent(ndk);
      event.content = JSON.stringify(profile);
      event.pubkey = pubkey;
      return event;
    } catch (e) {
      console.error(`Failed to fetch profile for ${pubkey}:`, e);
      return null;
    }
  });
  
  const results = await Promise.allSettled(fetchPromises);
  results.forEach(result => {
    if (result.status === 'fulfilled' && result.value) {
      allProfileEvents.push(result.value);
    }
  });
  
  return allProfileEvents;
}

export function extractPubkeysFromEvents(events: NDKEvent[]): Set<string> {
  const pubkeys = new Set<string>();

  events.forEach((event) => {
    // Add author pubkey
    if (event.pubkey) {
      pubkeys.add(event.pubkey);
    }

    // Add pubkeys from p tags
    const pTags = event.getMatchingTags("p");
    pTags.forEach((tag) => {
      if (tag[1]) {
        pubkeys.add(tag[1]);
      }
    });

    // Extract pubkeys from content (nostr:npub1... format)
    const npubPattern = /nostr:npub1[a-z0-9]{58}/g;
    const matches = event.content?.match(npubPattern) || [];
    matches.forEach((match) => {
      try {
        const npub = match.replace("nostr:", "");
        const decoded = nip19.decode(npub);
        if (decoded.type === "npub") {
          pubkeys.add(decoded.data as string);
        }
      } catch (e) {
        // Invalid npub, ignore
      }
    });
  });

  return pubkeys;
}

export function clearProfileCache(): void {
  unifiedProfileCache.clear();
}

export function replacePubkeysWithDisplayNames(text: string): string {
  // Match hex pubkeys (64 characters)
  const pubkeyRegex = /\b[0-9a-fA-F]{64}\b/g;

  return text.replace(pubkeyRegex, (match) => {
    return getDisplayNameSync(match);
  });
}
