import { WebSocketPool } from "../data_structures/websocket_pool.ts";
import { localRelays } from "../consts.ts";

/**
 * Service for discovering and testing local relays
 */
export class RelayDiscoveryService {
  /**
   * Tests connection to a relay using WebSocketPool
   * @param relayUrl The relay URL to test
   * @returns Promise that resolves to connection status
   */
  static async testRelayConnection(
    relayUrl: string,
  ): Promise<{
    connected: boolean;
    requiresAuth: boolean;
    error?: string;
    actualUrl?: string;
  }> {
    return new Promise(async (resolve) => {
      const secureUrl = this.ensureSecureWebSocket(relayUrl);
      let authRequired = false;
      let connected = false;
      let error: string | undefined;
      let actualUrl: string | undefined;

      const timeout = setTimeout(() => {
        resolve({
          connected: false,
          requiresAuth: authRequired,
          error: "Connection timeout",
          actualUrl,
        });
      }, 5000); // Increase timeout to 5 seconds

      try {
        console.debug(`[RelayDiscoveryService] Creating WebSocket connection to: ${secureUrl}`);
        // Use direct WebSocket instead of WebSocketPool for testing
        const ws = new WebSocket(secureUrl);
        
        ws.onopen = () => {
          console.debug(`[RelayDiscoveryService] WebSocket opened for: ${secureUrl}`);
          connected = true;
          actualUrl = secureUrl;
          clearTimeout(timeout);
          
          // Send a simple ping to test the connection
          ws.send(JSON.stringify(["REQ", "test", { limit: 1 }]));
          
          // Close the connection after a short delay
          setTimeout(() => {
            ws.close();
          }, 100);
          
          resolve({
            connected: true,
            requiresAuth: authRequired,
            error,
            actualUrl,
          });
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (Array.isArray(data) && data.length > 0) {
              const [type, ...rest] = data;
              if (type === "NOTICE" && rest[0]?.includes("auth-required")) {
                authRequired = true;
              }
            }
          } catch (e) {
            // Ignore parsing errors
          }
        };

        ws.onerror = (event) => {
          console.error(`[RelayDiscoveryService] WebSocket error for ${secureUrl}:`, event);
          error = "Connection failed";
          clearTimeout(timeout);
          resolve({
            connected: false,
            requiresAuth: authRequired,
            error,
            actualUrl,
          });
        };

        ws.onclose = (event) => {
          console.debug(`[RelayDiscoveryService] WebSocket closed for ${secureUrl}:`, event);
          if (!connected) {
            error = "Connection closed";
            clearTimeout(timeout);
            resolve({
              connected: false,
              requiresAuth: authRequired,
              error,
              actualUrl,
            });
          }
        };

      } catch (err) {
        console.error(`[RelayDiscoveryService] Error testing relay ${relayUrl}:`, err);
        error = err instanceof Error ? err.message : "Connection failed";
        clearTimeout(timeout);
        resolve({
          connected: false,
          requiresAuth: authRequired,
          error,
          actualUrl,
        });
      }
    });
  }

  /**
   * Ensures a relay URL uses secure WebSocket protocol for remote relays
   * @param url The relay URL to secure
   * @returns The URL with wss:// protocol (except for localhost)
   */
  private static ensureSecureWebSocket(url: string): string {
    // For localhost, always use ws:// (never wss://)
    if (url.includes('localhost') || url.includes('127.0.0.1')) {
      return url.replace(/^wss:\/\//, "ws://");
    }
    
    // Replace ws:// with wss:// for remote relays
    const secureUrl = url.replace(/^ws:\/\//, "wss://");

    if (secureUrl !== url) {
      console.warn(
        `[RelayDiscoveryService] Protocol upgrade for remote relay: ${url} -> ${secureUrl}`,
      );
    }

    return secureUrl;
  }

  /**
   * Tests connection to local relays
   * @param localRelayUrls Array of local relay URLs to test
   * @returns Promise that resolves to array of working local relay URLs
   */
  static async testLocalRelays(localRelayUrls: string[]): Promise<string[]> {
    const workingRelays: string[] = [];
    
    if (localRelayUrls.length === 0) {
      return workingRelays;
    }
    
    console.debug(`[RelayDiscoveryService] Testing ${localRelayUrls.length} local relays...`);
    
    await Promise.all(
      localRelayUrls.map(async (url) => {
        try {
          const result = await this.testRelayConnection(url);
          if (result.connected) {
            workingRelays.push(url);
            console.debug(`[RelayDiscoveryService] Local relay connected: ${url}`);
          } else {
            console.debug(`[RelayDiscoveryService] Local relay failed: ${url} - ${result.error}`);
          }
        } catch {
          // Silently ignore local relay failures - they're optional
          console.debug(`[RelayDiscoveryService] Local relay error (ignored): ${url}`);
        }
      })
    );
    
    console.debug(`[RelayDiscoveryService] Found ${workingRelays.length} working local relays`);
    return workingRelays;
  }

  /**
   * Discovers local relays by testing common localhost URLs
   * @returns Promise that resolves to array of working local relay URLs
   */
  static async discoverLocalRelays(): Promise<string[]> {
    try {
      // If no local relays are configured, return empty array
      if (localRelays.length === 0) {
        console.debug('[RelayDiscoveryService] No local relays configured');
        return [];
      }
      
      // Convert wss:// URLs from consts to ws:// for local testing
      const localRelayUrls = localRelays.map((url: string) => 
        url.replace(/^wss:\/\//, 'ws://')
      );
      
      const workingRelays = await this.testLocalRelays(localRelayUrls);
      
      // If no local relays are working, return empty array
      // The network detection logic will provide fallback relays
      return workingRelays;
    } catch {
      // Silently fail and return empty array
      return [];
    }
  }

  /**
   * Tests a set of relays in batches to avoid overwhelming them
   * @param relayUrls Array of relay URLs to test
   * @returns Promise that resolves to array of working relay URLs
   */
  static async testRelaySet(relayUrls: string[]): Promise<string[]> {
    const workingRelays: string[] = [];
    const maxConcurrent = 3; // Allow 3 concurrent tests for better performance

    console.debug(`[RelayDiscoveryService] Testing ${relayUrls.length} relays with max ${maxConcurrent} concurrent tests`);

    for (let i = 0; i < relayUrls.length; i += maxConcurrent) {
      const batch = relayUrls.slice(i, i + maxConcurrent);
      console.debug(`[RelayDiscoveryService] Testing batch ${Math.floor(i/maxConcurrent) + 1}:`, batch);
      
      const batchPromises = batch.map(async (url) => {
        try {
          console.debug(`[RelayDiscoveryService] Testing relay: ${url}`);
          const result = await this.testRelayConnection(url);
          console.debug(`[RelayDiscoveryService] Relay ${url} test result:`, result);
          if (result.connected) {
            console.debug(`[RelayDiscoveryService] ✓ Relay ${url} is working`);
            return url;
          } else {
            console.debug(`[RelayDiscoveryService] ✗ Relay ${url} failed: ${result.error}`);
            return null;
          }
        } catch (error) {
          console.debug(`[RelayDiscoveryService] ✗ Relay ${url} test failed:`, error);
          return null;
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);
      const batchWorkingRelays = batchResults
        .filter((result): result is PromiseFulfilledResult<string | null> => result.status === 'fulfilled')
        .map(result => result.value)
        .filter((url): url is string => url !== null);
      workingRelays.push(...batchWorkingRelays);
    }

    console.debug(`[RelayDiscoveryService] Relay testing complete. ${workingRelays.length}/${relayUrls.length} relays working:`, workingRelays);
    return workingRelays;
  }
} 