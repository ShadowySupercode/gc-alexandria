import type NDK from "@nostr-dev-kit/ndk";
import type { NDKUser, NDKKind } from "@nostr-dev-kit/ndk";
import { fetchEventWithFallback } from "../utils/nostrUtils.ts";
import { TIMEOUTS } from "../utils/search_constants.ts";

/**
 * Service for fetching user-specific relay information from Nostr events
 */
export class UserRelayService {
  /**
   * Fetches user's local relays from kind 10432 event
   * @param ndk NDK instance
   * @param user User to fetch local relays for
   * @returns Promise that resolves to array of local relay URLs
   */
  static async getUserLocalRelays(ndk: NDK, user: NDKUser): Promise<string[]> {
    try {
      console.debug('[UserRelayService] Fetching local relays for user:', user.pubkey);
      
      const localRelayEvent = await fetchEventWithFallback(
        ndk,
        {
          kinds: [10432 as NDKKind],
          authors: [user.pubkey],
        },
        TIMEOUTS.EVENT_FETCH
      );

      if (!localRelayEvent) {
        return [];
      }

      const localRelays: string[] = [];
      localRelayEvent.tags.forEach((tag) => {
        if (tag[0] === 'r' && tag[1]) {
          localRelays.push(tag[1]);
        }
      });

      return localRelays;
    } catch (error) {
      console.info('[UserRelayService] Error fetching user local relays:', error);
      return [];
    }
  }

  /**
   * Fetches user's blocked relays from kind 10006 event
   * @param ndk NDK instance
   * @param user User to fetch blocked relays for
   * @returns Promise that resolves to array of blocked relay URLs
   */
  static async getUserBlockedRelays(ndk: NDK, user: NDKUser): Promise<string[]> {
    try {
      console.debug('[UserRelayService] Fetching blocked relays for user:', user.pubkey);
      
      const blockedRelayEvent = await fetchEventWithFallback(
        ndk,
        {
          kinds: [10006],
          authors: [user.pubkey],
        },
        TIMEOUTS.EVENT_FETCH
      );

      if (!blockedRelayEvent) {
        return [];
      }

      const blockedRelays: string[] = [];
      blockedRelayEvent.tags.forEach((tag) => {
        if (tag[0] === 'r' && tag[1]) {
          blockedRelays.push(tag[1]);
        }
      });

      return blockedRelays;
    } catch (error) {
      console.info('[UserRelayService] Error fetching user blocked relays:', error);
      return [];
    }
  }

  /**
   * Fetches user's outbox relays from NIP-65 relay list
   * @param ndk NDK instance
   * @param user User to fetch outbox relays for
   * @returns Promise that resolves to array of outbox relay URLs
   */
  static async getUserOutboxRelays(ndk: NDK, user: NDKUser): Promise<string[]> {
    try {
      console.debug('[UserRelayService] Fetching outbox relays for user:', user.pubkey);
      
      const relayList = await fetchEventWithFallback(
        ndk,
        {
          kinds: [10002],
          authors: [user.pubkey],
        },
        TIMEOUTS.EVENT_FETCH
      );

      if (!relayList) {
        console.debug('[UserRelayService] No relay list found for user');
        return [];
      }

      console.debug('[UserRelayService] Found relay list event:', relayList.id);
      console.debug('[UserRelayService] Relay list tags:', relayList.tags);

      const outboxRelays: string[] = [];
      relayList.tags.forEach((tag) => {
        console.debug('[UserRelayService] Processing tag:', tag);
        if (tag[0] === 'w' && tag[1]) {
          outboxRelays.push(tag[1]);
          console.debug('[UserRelayService] Added outbox relay:', tag[1]);
        } else if (tag[0] === 'r' && tag[1]) {
          // Some relay lists use 'r' for both inbox and outbox
          outboxRelays.push(tag[1]);
          console.debug('[UserRelayService] Added relay (r tag):', tag[1]);
        } else {
          console.debug('[UserRelayService] Skipping tag:', tag[0], 'value:', tag[1]);
        }
      });

      console.debug('[UserRelayService] Final outbox relays:', outboxRelays);
      return outboxRelays;
    } catch (error) {
      console.info('[UserRelayService] Error fetching user outbox relays:', error);
      return [];
    }
  }

  /**
   * Gets browser extension's relay configuration by querying the extension directly
   * @returns Promise that resolves to array of extension relay URLs
   */
  static async getExtensionRelays(): Promise<string[]> {
    try {
      // Check if we're in a browser environment with extension support
      if (typeof window === 'undefined' || !globalThis.nostr) {
        console.debug('[UserRelayService] No globalThis.nostr available');
        return [];
      }

      console.debug('[UserRelayService] Extension available, checking for getRelays()');
      const extensionRelays: string[] = [];
      
      // Try to get relays from the extension's API
      if (globalThis.nostr.getRelays) {
        console.debug('[UserRelayService] getRelays() method found, calling it...');
        try {
          // Add timeout to prevent hanging
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Extension getRelays timeout')), 3000);
          });
          
          const relaysPromise = globalThis.nostr.getRelays();
          const relays = await Promise.race([relaysPromise, timeoutPromise]);
          
          console.debug('[UserRelayService] getRelays() returned:', relays);
          if (relays && typeof relays === 'object') {
            // Convert relay object to array of URLs
            const relayUrls = Object.keys(relays);
            extensionRelays.push(...relayUrls);
            console.debug('[UserRelayService] Got relays from extension:', relayUrls);
          }
        } catch (error) {
          console.debug('[UserRelayService] Extension getRelays() failed:', error);
        }
      } else {
        console.debug('[UserRelayService] getRelays() method not found on globalThis.nostr');
      }

      // If getRelays() didn't work, try alternative methods
      if (extensionRelays.length === 0) {
        // Some extensions might expose relays through other methods
        // This is a fallback for extensions that don't expose getRelays()
        console.debug('[UserRelayService] Extension does not expose relay configuration');
      }

      console.debug('[UserRelayService] Final extension relays:', extensionRelays);
      return extensionRelays;
    } catch (error) {
      console.debug('[UserRelayService] Error getting extension relays:', error);
      return [];
    }
  }

  /**
   * Fetches all user-specific relay information in parallel
   * @param ndk NDK instance
   * @param user User to fetch relays for
   * @returns Promise that resolves to all user relay information
   */
  static async getUserRelayInfo(ndk: NDK, user: NDKUser): Promise<{
    outboxRelays: string[];
    localRelays: string[];
    blockedRelays: string[];
    extensionRelays: string[];
  }> {
    console.debug('[UserRelayService] Fetching all user relay info for:', user.pubkey);
    
    // Run user-specific relay fetching in parallel for better performance
    const userRelayPromises = [
      this.getUserOutboxRelays(ndk, user).catch(error => {
        console.debug('[UserRelayService] Error fetching user outbox relays:', error);
        return [];
      }),
      this.getUserLocalRelays(ndk, user).catch(error => {
        console.debug('[UserRelayService] Error fetching user local relays:', error);
        return [];
      }),
      this.getUserBlockedRelays(ndk, user).catch(() => {
        // Silently ignore blocked relay fetch errors
        return [];
      }),
      this.getExtensionRelays().catch(error => {
        console.debug('[UserRelayService] Error fetching extension relays:', error);
        return [];
      })
    ];

    try {
      const [outboxRelays, localRelays, blockedRelays, extensionRelays] = await Promise.all(userRelayPromises);
      console.debug('[UserRelayService] User relay info gathered:', {
        outbox: outboxRelays.length,
        local: localRelays.length,
        blocked: blockedRelays.length,
        extension: extensionRelays.length
      });
      
      return {
        outboxRelays,
        localRelays,
        blockedRelays,
        extensionRelays
      };
    } catch (error) {
      console.debug('[UserRelayService] Error in parallel relay fetching:', error);
      // Fallback to empty arrays if parallel fetching fails
      return {
        outboxRelays: [],
        localRelays: [],
        blockedRelays: [],
        extensionRelays: []
      };
    }
  }
} 