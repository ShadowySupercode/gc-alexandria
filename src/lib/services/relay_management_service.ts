import NDK, { NDKUser } from "@nostr-dev-kit/ndk";
import { RelayDiscoveryService } from "./relay_discovery.ts";
import { UserRelayService } from "./user_relay_service.ts";
import { RelaySetBuilder } from "./relay_set_builder.ts";
import { NDKRelay } from "@nostr-dev-kit/ndk";

/**
 * Main service for managing relay operations
 */
export class RelayManagementService {
  /**
   * Tests connection to a relay and returns connection status
   * @param relayUrl The relay URL to test
   * @param ndk The NDK instance
   * @returns Promise that resolves to connection status
   */
  static async testRelayConnection(
    relayUrl: string,
    ndk: NDK,
  ): Promise<{
    connected: boolean;
    requiresAuth: boolean;
    error?: string;
    actualUrl?: string;
  }> {
    return RelayDiscoveryService.testRelayConnection(relayUrl);
  }

  /**
   * Builds a complete relay set for a user, including local, user-specific, and fallback relays
   * @param ndk NDK instance
   * @param user NDKUser or null for anonymous access
   * @returns Promise that resolves to inbox and outbox relay arrays
   */
  static async buildCompleteRelaySet(
    ndk: NDK,
    user: NDKUser | null
  ): Promise<{ inboxRelays: string[]; outboxRelays: string[] }> {
    return RelaySetBuilder.buildCompleteRelaySet(ndk, user);
  }

  /**
   * Gets the relay set specifically for search operations
   * @param ndk NDK instance
   * @param user Current user (null for anonymous)
   * @returns Promise that resolves to search relay URLs
   */
  static async getSearchRelaySet(ndk: NDK, user: NDKUser | null): Promise<string[]> {
    return RelaySetBuilder.getSearchRelaySet(ndk, user);
  }

  /**
   * Gets all possible relays based on consts and user state
   * @param ndk NDK instance
   * @param user Current user (null for anonymous)
   * @returns Promise that resolves to all possible relay URLs
   */
  static async getAllPossibleRelays(ndk: NDK, user: NDKUser | null): Promise<string[]> {
    return RelaySetBuilder.getAllPossibleRelays(ndk, user);
  }

  /**
   * Gets a simple list of working relays for the application
   * @param ndk NDK instance
   * @param user Current user (null for anonymous)
   * @returns Promise that resolves to working relay URLs
   */
  static async getWorkingRelays(ndk: NDK, user: NDKUser | null): Promise<string[]> {
    console.debug('[RelayManagementService] getWorkingRelays: Getting working relays for user:', user?.pubkey || 'null');
    
    // Get all possible relays
    const allPossibleRelays = await this.getAllPossibleRelays(ndk, user);
    
    // Test all relays to find working ones
    const workingRelays = await RelayDiscoveryService.testRelaySet(allPossibleRelays);
    
    console.debug('[RelayManagementService] getWorkingRelays: Found', workingRelays.length, 'working relays out of', allPossibleRelays.length, 'possible relays');
    return workingRelays;
  }

  /**
   * Initializes relay stores with working relays
   * @param activeInboxRelays Store for inbox relays
   * @param activeOutboxRelays Store for outbox relays
   * @param ndk NDK instance
   * @param user Current user (null for anonymous)
   */
  static async initializeRelayStores(
    activeInboxRelays: any,
    activeOutboxRelays: any,
    ndk: NDK,
    user: NDKUser | null
  ): Promise<void> {
    console.debug('[RelayManagementService] initializeRelayStores: Initializing relay stores for user:', user?.pubkey || 'null');
    
    try {
      console.debug('[RelayManagementService] Building complete relay set...');
      const relaySet = await this.buildCompleteRelaySet(ndk, user);
      console.debug('[RelayManagementService] Relay set built:', relaySet);
      
      console.debug('[RelayManagementService] Setting relay stores...');
      activeInboxRelays.set(relaySet.inboxRelays);
      activeOutboxRelays.set(relaySet.outboxRelays);
      
      console.debug('[RelayManagementService] Relay stores initialized:', {
        inboxCount: relaySet.inboxRelays.length,
        outboxCount: relaySet.outboxRelays.length,
        inboxRelays: relaySet.inboxRelays,
        outboxRelays: relaySet.outboxRelays
      });

      // Add relays to NDK pool so they can be used by subscription search
      console.debug('[RelayManagementService] Adding relays to NDK pool...');
      const allRelays = [...relaySet.inboxRelays, ...relaySet.outboxRelays];
      const uniqueRelays = [...new Set(allRelays)];
      
      for (const relayUrl of uniqueRelays) {
        try {
          // Check if relay is already in the pool
          const existingRelay = ndk.pool?.getRelay(relayUrl);
          if (!existingRelay) {
            // Create new relay and add to pool
            const relay = new NDKRelay(relayUrl, undefined, ndk);
            ndk.pool?.addRelay(relay);
            console.debug('[RelayManagementService] Added relay to NDK pool:', relayUrl);
          } else {
            console.debug('[RelayManagementService] Relay already in NDK pool:', relayUrl);
          }
        } catch (error) {
          console.warn('[RelayManagementService] Failed to add relay to NDK pool:', relayUrl, error);
        }
      }
      
      console.debug('[RelayManagementService] NDK pool relays after initialization:', 
        Array.from(ndk.pool?.relays.values() || []).map((r: any) => r.url));
      
    } catch (error) {
      console.error('[RelayManagementService] Error initializing relay stores:', error);
      // Set empty arrays as fallback
      activeInboxRelays.set([]);
      activeOutboxRelays.set([]);
    }
  }

  /**
   * Fetches user's local relays from kind 10432 event
   * @param ndk NDK instance
   * @param user User to fetch local relays for
   * @returns Promise that resolves to array of local relay URLs
   */
  static async getUserLocalRelays(ndk: NDK, user: NDKUser): Promise<string[]> {
    return UserRelayService.getUserLocalRelays(ndk, user);
  }

  /**
   * Fetches user's blocked relays from kind 10006 event
   * @param ndk NDK instance
   * @param user User to fetch blocked relays for
   * @returns Promise that resolves to array of blocked relay URLs
   */
  static async getUserBlockedRelays(ndk: NDK, user: NDKUser): Promise<string[]> {
    return UserRelayService.getUserBlockedRelays(ndk, user);
  }

  /**
   * Fetches user's outbox relays from NIP-65 relay list
   * @param ndk NDK instance
   * @param user User to fetch outbox relays for
   * @returns Promise that resolves to array of outbox relay URLs
   */
  static async getUserOutboxRelays(ndk: NDK, user: NDKUser): Promise<string[]> {
    return UserRelayService.getUserOutboxRelays(ndk, user);
  }

  /**
   * Gets browser extension's relay configuration
   * @returns Promise that resolves to array of extension relay URLs
   */
  static async getExtensionRelays(): Promise<string[]> {
    return UserRelayService.getExtensionRelays();
  }

  /**
   * Discovers local relays by testing common localhost URLs
   * @returns Promise that resolves to array of working local relay URLs
   */
  static async discoverLocalRelays(): Promise<string[]> {
    return RelayDiscoveryService.discoverLocalRelays();
  }

  /**
   * Tests a set of relays in batches to avoid overwhelming them
   * @param relayUrls Array of relay URLs to test
   * @returns Promise that resolves to array of working relay URLs
   */
  static async testRelaySet(relayUrls: string[]): Promise<string[]> {
    return RelayDiscoveryService.testRelaySet(relayUrls);
  }

  /**
   * Normalizes a relay URL to a standard format
   * @param url The relay URL to normalize
   * @returns The normalized relay URL
   */
  static normalizeRelayUrl(url: string): string {
    return RelaySetBuilder.normalizeRelayUrl(url);
  }

  /**
   * Normalizes an array of relay URLs
   * @param urls Array of relay URLs to normalize
   * @returns Array of normalized relay URLs
   */
  static normalizeRelayUrls(urls: string[]): string[] {
    return RelaySetBuilder.normalizeRelayUrls(urls);
  }

  /**
   * Removes duplicates from an array of relay URLs
   * @param urls Array of relay URLs
   * @returns Array of unique relay URLs
   */
  static deduplicateRelayUrls(urls: string[]): string[] {
    return RelaySetBuilder.deduplicateRelayUrls(urls);
  }
} 