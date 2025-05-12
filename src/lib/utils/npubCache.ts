export type NpubMetadata = { name?: string; displayName?: string };

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

  getAll(): Record<string, NpubMetadata> {
    return { ...this.cache };
  }
}

export const npubCache = new NpubCache();