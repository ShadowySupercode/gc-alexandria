import NDK, { NDKUser } from "@nostr-dev-kit/ndk";
import { 
  searchRelays, 
  secondaryRelays, 
  anonymousRelays, 
  lowbandwidthRelays 
} from "../consts.ts";
import { getRelaySetForNetworkCondition } from "../utils/network_detection.ts";
import { networkCondition } from "../stores/networkStore.ts";
import { get } from "svelte/store";
import { RelayDiscoveryService } from "./relay_discovery.ts";
import { UserRelayService } from "./user_relay_service.ts";

/**
 * Service for building complete relay sets based on user state and network conditions
 */
export class RelaySetBuilder {
  /**
   * Normalizes a relay URL to a standard format
   * @param url The relay URL to normalize
   * @returns The normalized relay URL
   */
  static normalizeRelayUrl(url: string): string {
    let normalized = url.toLowerCase().trim();
    
    // Ensure protocol is present
    if (!normalized.startsWith('ws://') && !normalized.startsWith('wss://')) {
      normalized = 'wss://' + normalized;
    }
    
    // Remove trailing slash
    normalized = normalized.replace(/\/$/, '');
    
    return normalized;
  }

  /**
   * Normalizes an array of relay URLs
   * @param urls Array of relay URLs to normalize
   * @returns Array of normalized relay URLs
   */
  static normalizeRelayUrls(urls: string[]): string[] {
    return urls.map(this.normalizeRelayUrl);
  }

  /**
   * Removes duplicates from an array of relay URLs
   * @param urls Array of relay URLs
   * @returns Array of unique relay URLs
   */
  static deduplicateRelayUrls(urls: string[]): string[] {
    const normalized = this.normalizeRelayUrls(urls);
    return [...new Set(normalized)];
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
    try {
      return await this.buildCompleteRelaySetInternal(ndk, user);
    } catch (error) {
      console.debug('[RelaySetBuilder] buildCompleteRelaySet: Error, returning fallback relays:', error);
      // Return fallback relays on error
      if (user) {
        return {
          inboxRelays: this.deduplicateRelayUrls(secondaryRelays),
          outboxRelays: this.deduplicateRelayUrls(secondaryRelays)
        };
      } else {
        return {
          inboxRelays: this.deduplicateRelayUrls(secondaryRelays),
          outboxRelays: this.deduplicateRelayUrls(anonymousRelays)
        };
      }
    }
  }

  private static async buildCompleteRelaySetInternal(
    ndk: NDK,
    user: NDKUser | null
  ): Promise<{ inboxRelays: string[]; outboxRelays: string[] }> {
    console.debug('[RelaySetBuilder] buildCompleteRelaySet: Starting with user:', user?.pubkey || 'null');
    console.debug('[RelaySetBuilder] buildCompleteRelaySet: Relay constants:', {
      secondaryRelays,
      anonymousRelays,
      searchRelays,
      lowbandwidthRelays
    });
    
    // Discover local relays first (available to everyone)
    console.debug('[RelaySetBuilder] buildCompleteRelaySet: Discovering local relays...');
    const discoveredLocalRelays = await RelayDiscoveryService.discoverLocalRelays();
    console.debug('[RelaySetBuilder] buildCompleteRelaySet: Discovered local relays:', discoveredLocalRelays);

    // Get user-specific relays if available
    let userOutboxRelays: string[] = [];
    let userLocalRelays: string[] = [];
    let blockedRelays: string[] = [];
    let extensionRelays: string[] = [];

    if (user) {
      console.debug('[RelaySetBuilder] buildCompleteRelaySet: Fetching user-specific relays for:', user.pubkey);
      
      try {
        const userRelayInfo = await UserRelayService.getUserRelayInfo(ndk, user);
        userOutboxRelays = userRelayInfo.outboxRelays;
        userLocalRelays = userRelayInfo.localRelays;
        blockedRelays = userRelayInfo.blockedRelays;
        extensionRelays = userRelayInfo.extensionRelays;
        
        console.debug('[RelaySetBuilder] buildCompleteRelaySet: User relay info gathered:', {
          outbox: userOutboxRelays.length,
          local: userLocalRelays.length,
          blocked: blockedRelays.length,
          extension: extensionRelays.length
        });
      } catch (error) {
        console.debug('[RelaySetBuilder] Error in user relay fetching:', error);
        // Fallback to empty arrays if user relay fetching fails
        userOutboxRelays = [];
        userLocalRelays = [];
        blockedRelays = [];
        extensionRelays = [];
      }
    } else {
      console.debug('[RelaySetBuilder] buildCompleteRelaySet: No user provided, skipping user-specific relays');
    }

    // Build relay sets according to the corrected logic
    let inboxRelays: string[];
    let outboxRelays: string[];

    if (user) {
      // Logged-in users
      // Inbox: secondaryRelays + localRelays
      inboxRelays = this.deduplicateRelayUrls([...secondaryRelays, ...discoveredLocalRelays]);
      
      // Outbox: localRelays + outboxRelays (with secondary fallback if empty)
      const userOutboxWithLocal = [...discoveredLocalRelays, ...userOutboxRelays];
      outboxRelays = userOutboxWithLocal.length > 0 
        ? this.deduplicateRelayUrls(userOutboxWithLocal)
        : this.deduplicateRelayUrls([...discoveredLocalRelays, ...secondaryRelays]);
    } else {
      // Anonymous users
      // Inbox: secondaryRelays + localRelays
      inboxRelays = this.deduplicateRelayUrls([...secondaryRelays, ...discoveredLocalRelays]);
      
      // Outbox: localRelays + anonRelays
      outboxRelays = this.deduplicateRelayUrls([...discoveredLocalRelays, ...anonymousRelays]);
    }

    console.debug('[RelaySetBuilder] buildCompleteRelaySet: Built relay sets:', {
      inboxRelays,
      outboxRelays,
      secondaryRelays,
      discoveredLocalRelays,
      anonymousRelays
    });

    console.debug('[RelaySetBuilder] buildCompleteRelaySet: Initial relay sets - inbox:', inboxRelays.length, 'outbox:', outboxRelays.length);
    console.debug('[RelaySetBuilder] buildCompleteRelaySet: Initial inbox relays:', inboxRelays);
    console.debug('[RelaySetBuilder] buildCompleteRelaySet: Initial outbox relays:', outboxRelays);

    // Test relays and filter out non-working ones
    let testedInboxRelays: string[] = [];
    let testedOutboxRelays: string[] = [];

    // Temporarily skip relay testing and use all relays
    console.debug('[RelaySetBuilder] buildCompleteRelaySet: Skipping relay testing for now, using all relays');
    testedInboxRelays = inboxRelays;
    testedOutboxRelays = outboxRelays;
    
    console.debug('[RelaySetBuilder] buildCompleteRelaySet: Using inbox relays:', testedInboxRelays);
    console.debug('[RelaySetBuilder] buildCompleteRelaySet: Using outbox relays:', testedOutboxRelays);

    // If no relays passed testing, use fallback relays
    if (testedInboxRelays.length === 0 && testedOutboxRelays.length === 0) {
      console.debug('[RelaySetBuilder] buildCompleteRelaySet: No relays passed testing, using fallback relays');
      if (user) {
        // Logged-in user fallback
        return {
          inboxRelays: this.deduplicateRelayUrls(secondaryRelays),
          outboxRelays: this.deduplicateRelayUrls(secondaryRelays)
        };
      } else {
        // Anonymous user fallback
        return {
          inboxRelays: this.deduplicateRelayUrls(secondaryRelays),
          outboxRelays: this.deduplicateRelayUrls(anonymousRelays)
        };
      }
    }

    // Use tested relays and deduplicate
    const finalInboxRelays = testedInboxRelays.length > 0 ? this.deduplicateRelayUrls(testedInboxRelays) : this.deduplicateRelayUrls(secondaryRelays);
    const finalOutboxRelays = testedOutboxRelays.length > 0 ? this.deduplicateRelayUrls(testedOutboxRelays) : (user ? this.deduplicateRelayUrls(secondaryRelays) : this.deduplicateRelayUrls(anonymousRelays));

    // Apply network condition optimization
    const currentNetworkCondition = get(networkCondition);
    const networkOptimizedRelaySet = getRelaySetForNetworkCondition(
      currentNetworkCondition,
      discoveredLocalRelays,
      lowbandwidthRelays,
      { inboxRelays: finalInboxRelays, outboxRelays: finalOutboxRelays }
    );

    // Filter out blocked relays and deduplicate final sets
    const finalRelaySet = {
      inboxRelays: this.deduplicateRelayUrls(networkOptimizedRelaySet.inboxRelays.filter((r: string) => !blockedRelays.includes(r))),
      outboxRelays: this.deduplicateRelayUrls(networkOptimizedRelaySet.outboxRelays.filter((r: string) => !blockedRelays.includes(r)))
    };

    // If no relays are working, use fallback relays
    if (finalRelaySet.inboxRelays.length === 0 && finalRelaySet.outboxRelays.length === 0) {
      console.debug('[RelaySetBuilder] buildCompleteRelaySet: No relays working, using fallback relays');
      if (user) {
        // Logged-in user fallback
        return {
          inboxRelays: this.deduplicateRelayUrls(secondaryRelays),
          outboxRelays: this.deduplicateRelayUrls(secondaryRelays)
        };
      } else {
        // Anonymous user fallback
        return {
          inboxRelays: this.deduplicateRelayUrls(secondaryRelays),
          outboxRelays: this.deduplicateRelayUrls(anonymousRelays)
        };
      }
    }

    console.debug('[RelaySetBuilder] buildCompleteRelaySet: Final relay sets - inbox:', finalRelaySet.inboxRelays.length, 'outbox:', finalRelaySet.outboxRelays.length);
    console.debug('[RelaySetBuilder] buildCompleteRelaySet: Final inbox relays:', finalRelaySet.inboxRelays);
    console.debug('[RelaySetBuilder] buildCompleteRelaySet: Final outbox relays:', finalRelaySet.outboxRelays);
    
    return finalRelaySet;
  }

  /**
   * Gets the relay set specifically for search operations
   * @param ndk NDK instance
   * @param user Current user (null for anonymous)
   * @returns Promise that resolves to search relay URLs
   */
  static async getSearchRelaySet(ndk: NDK, user: NDKUser | null): Promise<string[]> {
    console.debug('[RelaySetBuilder] getSearchRelaySet: Getting search relays for user:', user?.pubkey || 'null');
    
    // Discover local relays (available to everyone)
    const discoveredLocalRelays = await RelayDiscoveryService.discoverLocalRelays();
    
    // Base search relays: searchRelays + secondaryRelays + localRelays
    let searchRelayUrls = this.deduplicateRelayUrls([...searchRelays, ...secondaryRelays, ...discoveredLocalRelays]);
    
    if (user) {
      // For logged-in users, also include their inbox relays
      const userRelaySet = await this.buildCompleteRelaySet(ndk, user);
      searchRelayUrls = this.deduplicateRelayUrls([...searchRelayUrls, ...userRelaySet.inboxRelays]);
    }
    
    console.debug('[RelaySetBuilder] getSearchRelaySet: Final search relays:', searchRelayUrls);
    return searchRelayUrls;
  }

  /**
   * Gets all possible relays based on consts and user state
   * @param ndk NDK instance
   * @param user Current user (null for anonymous)
   * @returns Promise that resolves to all possible relay URLs
   */
  static async getAllPossibleRelays(ndk: NDK, user: NDKUser | null): Promise<string[]> {
    console.debug('[RelaySetBuilder] getAllPossibleRelays: Getting all possible relays for user:', user?.pubkey || 'null');
    
    // Start with all relay types from consts
    const allRelays = [
      ...searchRelays,
      ...secondaryRelays,
      ...anonymousRelays,
      ...lowbandwidthRelays
    ];
    
    // Add discovered local relays
    const discoveredLocalRelays = await RelayDiscoveryService.discoverLocalRelays();
    allRelays.push(...discoveredLocalRelays);
    
    // Add user-specific relays if available
    if (user) {
      try {
        const userRelayInfo = await UserRelayService.getUserRelayInfo(ndk, user);
        allRelays.push(...userRelayInfo.outboxRelays);
        allRelays.push(...userRelayInfo.localRelays);
        allRelays.push(...userRelayInfo.extensionRelays);
        // Note: We don't add blocked relays to the "all possible" list
      } catch (error) {
        console.debug('[RelaySetBuilder] Error fetching user relays for getAllPossibleRelays:', error);
      }
    }
    
    // Deduplicate and return
    const uniqueRelays = this.deduplicateRelayUrls(allRelays);
    console.debug('[RelaySetBuilder] getAllPossibleRelays: Found', uniqueRelays.length, 'unique relays');
    return uniqueRelays;
  }
} 