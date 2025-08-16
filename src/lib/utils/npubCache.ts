import type { NostrProfile } from "./nostrUtils";

export type NpubMetadata = NostrProfile;

class NpubCache {
  private cache: Record<string, NpubMetadata> = {};
  private readonly storageKey = "alexandria_npub_cache";
  private readonly maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      if (typeof window !== "undefined") {
        const stored = localStorage.getItem(this.storageKey);
        if (stored) {
          const data = JSON.parse(stored) as Record<
            string,
            { profile: NpubMetadata; timestamp: number }
          >;
          const now = Date.now();

          // Filter out expired entries
          for (const [key, entry] of Object.entries(data)) {
            if (entry.timestamp && (now - entry.timestamp) < this.maxAge) {
              this.cache[key] = entry.profile;
            }
          }
        }
      }
    } catch (error) {
      console.warn("Failed to load npub cache from storage:", error);
    }
  }

  private saveToStorage(): void {
    try {
      if (typeof window !== "undefined") {
        const data: Record<
          string,
          { profile: NpubMetadata; timestamp: number }
        > = {};
        for (const [key, profile] of Object.entries(this.cache)) {
          data[key] = { profile, timestamp: Date.now() };
        }
        localStorage.setItem(this.storageKey, JSON.stringify(data));
      }
    } catch (error) {
      console.warn("Failed to save npub cache to storage:", error);
    }
  }

  get(key: string): NpubMetadata | undefined {
    return this.cache[key];
  }

  set(key: string, value: NpubMetadata): void {
    this.cache[key] = value;
    this.saveToStorage();
  }

  has(key: string): boolean {
    return key in this.cache;
  }

  delete(key: string): boolean {
    if (key in this.cache) {
      delete this.cache[key];
      this.saveToStorage();
      return true;
    }
    return false;
  }

  deleteMany(keys: string[]): number {
    let deleted = 0;
    for (const key of keys) {
      if (this.delete(key)) {
        deleted++;
      }
    }
    return deleted;
  }

  clear(): void {
    this.cache = {};
    this.saveToStorage();
  }

  size(): number {
    return Object.keys(this.cache).length;
  }

  getAll(): Record<string, NpubMetadata> {
    return { ...this.cache };
  }
}

export const npubCache = new NpubCache();
