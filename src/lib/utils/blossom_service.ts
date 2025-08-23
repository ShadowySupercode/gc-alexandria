import NDK, { NDKEvent } from "@nostr-dev-kit/ndk";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils";
import { NostrKind } from "../types.ts";
import { userStore } from "../stores/userStore.ts";
import { get } from "svelte/store";

/**
 * Blossom service for handling NIP-B7 media fallback functionality
 * 
 * This service implements the Blossom protocol for handling media files
 * that are addressed by their SHA-256 hash. When a media URL fails,
 * it can fall back to Blossom servers to retrieve the content.
 */
export class BlossomService {
  private ndk: NDK;
  private serverCache = new Map<string, string[]>(); // pubkey -> server URLs
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes
  private cacheTimestamps = new Map<string, number>();

  constructor(ndk: NDK) {
    this.ndk = ndk;
  }

  /**
   * Extract SHA-256 hash from a URL that ends with a 64-character hex string
   * @param url The URL to check
   * @returns The SHA-256 hash if found, null otherwise
   */
  extractSha256FromUrl(url: string): string | null {
    // Match URLs ending with 64-character hex string, optionally with file extension
    const match = url.match(/([a-fA-F0-9]{64})(\.[a-zA-Z0-9]+)?$/);
    return match ? match[1] : null;
  }

  /**
   * Check if a URL is a potential Blossom-style URL
   * @param url The URL to check
   * @returns True if the URL ends with a 64-character hex string
   */
  isBlossomStyleUrl(url: string): boolean {
    return this.extractSha256FromUrl(url) !== null;
  }

  /**
   * Get Blossom servers for a specific user
   * @param pubkey The user's public key
   * @returns Array of Blossom server URLs
   */
  async getBlossomServers(pubkey: string): Promise<string[]> {
    // First check if this is the current user and we have cached servers
    const currentUser = get(userStore);
    if (currentUser.signedIn && currentUser.pubkey === pubkey && currentUser.blossomServers.length > 0) {
      return currentUser.blossomServers;
    }

    // Fall back to on-demand fetching for other users
    const now = Date.now();
    const cached = this.serverCache.get(pubkey);
    const timestamp = this.cacheTimestamps.get(pubkey);

    // Return cached result if still valid
    if (cached && timestamp && (now - timestamp) < this.cacheTimeout) {
      return cached;
    }

    try {
      // Fetch the user's kind 10063 event
      const filter = {
        kinds: [NostrKind.BlossomServerList as number],
        authors: [pubkey],
        limit: 1,
      };

      const events = await this.ndk.fetchEvents(filter);
      const blossomEvent = Array.from(events)[0];

      if (!blossomEvent) {
        // Cache empty result to avoid repeated queries
        this.serverCache.set(pubkey, []);
        this.cacheTimestamps.set(pubkey, now);
        return [];
      }

      // Extract server URLs from tags
      const servers = blossomEvent.tags
        .filter(tag => tag[0] === "server" && tag[1])
        .map(tag => tag[1]);

      // Cache the result
      this.serverCache.set(pubkey, servers);
      this.cacheTimestamps.set(pubkey, now);

      return servers;
    } catch (error) {
      console.error("[BlossomService] Error fetching Blossom servers:", error);
      return [];
    }
  }

  /**
   * Generate Blossom URLs for a given SHA-256 hash and file extension
   * @param hash The SHA-256 hash
   * @param servers Array of Blossom server URLs
   * @param extension Optional file extension (e.g., ".png", ".jpg")
   * @returns Array of potential Blossom URLs
   */
  generateBlossomUrls(hash: string, servers: string[], extension?: string): string[] {
    const suffix = extension ? `${hash}${extension}` : hash;
    return servers.map(server => {
      // Ensure server URL ends with slash
      const baseUrl = server.endsWith('/') ? server : `${server}/`;
      return `${baseUrl}${suffix}`;
    });
  }

  /**
   * Verify that downloaded content matches the expected SHA-256 hash
   * @param content The file content as ArrayBuffer
   * @param expectedHash The expected SHA-256 hash
   * @returns True if the hash matches, false otherwise
   */
  verifySha256Hash(content: ArrayBuffer, expectedHash: string): boolean {
    try {
      const hash = bytesToHex(sha256(new Uint8Array(content)));
      return hash.toLowerCase() === expectedHash.toLowerCase();
    } catch (error) {
      console.error("[BlossomService] Error verifying SHA-256 hash:", error);
      return false;
    }
  }

  /**
   * Try to fetch media from Blossom servers as fallback
   * @param hash The SHA-256 hash of the media file
   * @param pubkey The author's public key
   * @param extension Optional file extension
   * @returns The media content as ArrayBuffer if found and verified, null otherwise
   */
  async fetchFromBlossomServers(
    hash: string, 
    pubkey: string, 
    extension?: string
  ): Promise<ArrayBuffer | null> {
    try {
      const servers = await this.getBlossomServers(pubkey);
      if (servers.length === 0) {
        return null;
      }

      const urls = this.generateBlossomUrls(hash, servers, extension);

      // Try each URL in parallel, return the first successful result
      const promises = urls.map(async (url) => {
        try {
          const response = await fetch(url, {
            method: 'GET',
            signal: AbortSignal.timeout(10000), // 10 second timeout
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const content = await response.arrayBuffer();
          
          // Verify the SHA-256 hash
          if (!this.verifySha256Hash(content, hash)) {
            throw new Error('SHA-256 hash verification failed');
          }

          return content;
        } catch (error) {
          console.warn(`[BlossomService] Failed to fetch from ${url}:`, error);
          return null;
        }
      });

      const results = await Promise.allSettled(promises);
      
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          return result.value;
        }
      }

      return null;
    } catch (error) {
      console.error("[BlossomService] Error fetching from Blossom servers:", error);
      return null;
    }
  }

  /**
   * Enhanced media URL resolver that includes Blossom fallback
   * @param url The original media URL
   * @param pubkey The author's public key
   * @returns Promise that resolves to the media content or null
   */
  async resolveMediaUrl(url: string, pubkey: string): Promise<ArrayBuffer | null> {
    try {
      // First try the original URL
      const response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        return await response.arrayBuffer();
      }

      // If original URL fails and it's a Blossom-style URL, try Blossom servers
      const hash = this.extractSha256FromUrl(url);
      if (hash) {
        console.log(`[BlossomService] Original URL failed, trying Blossom servers for hash: ${hash}`);
        
        // Extract file extension from original URL
        const extensionMatch = url.match(/\.[a-zA-Z0-9]+$/);
        const extension = extensionMatch ? extensionMatch[0] : undefined;
        
        return await this.fetchFromBlossomServers(hash, pubkey, extension);
      }

      return null;
    } catch (error) {
      console.error("[BlossomService] Error resolving media URL:", error);
      
      // If it's a Blossom-style URL, try Blossom servers as fallback
      const hash = this.extractSha256FromUrl(url);
      if (hash) {
        console.log(`[BlossomService] Trying Blossom servers as fallback for hash: ${hash}`);
        
        const extensionMatch = url.match(/\.[a-zA-Z0-9]+$/);
        const extension = extensionMatch ? extensionMatch[0] : undefined;
        
        return await this.fetchFromBlossomServers(hash, pubkey, extension);
      }

      return null;
    }
  }

  /**
   * Clear the server cache (useful for testing or memory management)
   */
  clearCache(): void {
    this.serverCache.clear();
    this.cacheTimestamps.clear();
  }
}
