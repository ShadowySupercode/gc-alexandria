import type { NostrProfile } from './nostrUtils';

export type NpubMetadata = NostrProfile;

class NpubCache {
  private cache: Record<string, NpubMetadata> = {};

  get(key: string): NpubMetadata | undefined {
    return this.cache[key];
  }

  set(key: string, value: NpubMetadata): void {
    this.cache[key] = value;
  }

  has(key: string): boolean {
    return key in this.cache;
  }

  delete(key: string): boolean {
    if (key in this.cache) {
      delete this.cache[key];
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
  }

  size(): number {
    return Object.keys(this.cache).length;
  }

  getAll(): Record<string, NpubMetadata> {
    return { ...this.cache };
  }
}

export const npubCache = new NpubCache();