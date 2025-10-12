import { unifiedProfileCache } from "./npubCache";
import { searchCache } from "./searchCache";
import { indexEventCache } from "./indexEventCache";
import { clearRelaySetCache } from "../ndk";

/**
 * Clears all application caches
 *
 * Clears:
 * - unifiedProfileCache (profile metadata)
 * - searchCache (search results)
 * - indexEventCache (index events)
 * - relaySetCache (relay configuration)
 */
export function clearAllCaches(): void {
  console.log("[CacheManager] Clearing all application caches...");

  // Clear in-memory caches
  unifiedProfileCache.clear();
  searchCache.clear();
  indexEventCache.clear();
  clearRelaySetCache();

  // Clear localStorage caches
  clearLocalStorageCaches();

  console.log("[CacheManager] All caches cleared successfully");
}

/**
 * Clears profile-specific caches to force fresh profile data
 * This is useful when profile pictures or metadata are stale
 */
export function clearProfileCaches(): void {
  console.log("[CacheManager] Clearing profile-specific caches...");

  // Clear unified profile cache (single source of truth for all profile data)
  unifiedProfileCache.clear();

  // Clear profile-related search results
  // Note: searchCache doesn't have a way to clear specific types, so we clear all
  // This is acceptable since profile searches are the most common
  searchCache.clear();

  console.log("[CacheManager] Profile caches cleared successfully");
}

/**
 * Clears only profile search caches while preserving profile data
 * This forces fresh profile searches but keeps individual profile data cached
 */
export function clearProfileSearchCaches(): void {
  console.log('[CacheManager] Clearing profile search caches...');

  // Only clear search cache - profile data in UnifiedProfileCache remains
  searchCache.clear();

  console.log('[CacheManager] Profile search caches cleared successfully');
}

/**
 * Clears localStorage caches
 */
function clearLocalStorageCaches(): void {
  if (typeof window === "undefined") return;

  const keysToRemove: string[] = [];

  // Find all localStorage keys that start with 'alexandria'
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith("alexandria")) {
      keysToRemove.push(key);
    }
  }

  // Remove the keys
  keysToRemove.forEach((key) => {
    localStorage.removeItem(key);
  });

  console.log(
    `[CacheManager] Cleared ${keysToRemove.length} localStorage items`,
  );
}

/**
 * Gets statistics about all caches
 */
export function getCacheStats(): {
  profileCacheSize: number;
  searchCacheSize: number;
  indexEventCacheSize: number;
} {
  return {
    profileCacheSize: unifiedProfileCache.size(),
    searchCacheSize: searchCache.size(),
    indexEventCacheSize: indexEventCache.size(),
  };
}
