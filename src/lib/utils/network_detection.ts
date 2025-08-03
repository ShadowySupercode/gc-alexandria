import { deduplicateRelayUrls } from "./relay_management.ts";

/**
 * Network conditions for relay selection
 */
export enum NetworkCondition {
  ONLINE = 'online',
  SLOW = 'slow',
  OFFLINE = 'offline'
}

/**
 * Network connectivity test endpoints
 */
const NETWORK_ENDPOINTS = [
  'https://www.google.com/favicon.ico',
  'https://httpbin.org/status/200',
  'https://api.github.com/zen'
];

/**
 * Detects if the network is online using more reliable endpoints
 * @returns Promise that resolves to true if online, false otherwise
 */
export async function isNetworkOnline(): Promise<boolean> {
  for (const endpoint of NETWORK_ENDPOINTS) {
    try {
      // Use a simple fetch without HEAD method to avoid CORS issues
      await fetch(endpoint, {
        method: 'GET',
        cache: 'no-cache',
        signal: AbortSignal.timeout(3000),
        mode: 'no-cors' // Use no-cors mode to avoid CORS issues
      });
      // With no-cors mode, we can't check response.ok, so we assume success if no error
      return true;
    } catch (error) {
      console.debug(`[network_detection.ts] Failed to reach ${endpoint}:`, error);
      continue;
    }
  }
  
  console.debug('[network_detection.ts] All network endpoints failed');
  return false;
}

/**
 * Tests network speed by measuring response time
 * @returns Promise that resolves to network speed in milliseconds
 */
export async function testNetworkSpeed(): Promise<number> {
  const startTime = performance.now();
  
  for (const endpoint of NETWORK_ENDPOINTS) {
    try {
      await fetch(endpoint, {
        method: 'GET',
        cache: 'no-cache',
        signal: AbortSignal.timeout(5000),
        mode: 'no-cors' // Use no-cors mode to avoid CORS issues
      });
      
      const endTime = performance.now();
      return endTime - startTime;
    } catch (error) {
      console.debug(`[network_detection.ts] Speed test failed for ${endpoint}:`, error);
      continue;
    }
  }
  
  console.debug('[network_detection.ts] Network speed test failed for all endpoints');
  return Infinity; // Very slow if it fails
}

/**
 * Determines network condition based on connectivity and speed
 * @returns Promise that resolves to NetworkCondition
 */
export async function detectNetworkCondition(): Promise<NetworkCondition> {
  const isOnline = await isNetworkOnline();
  
  if (!isOnline) {
    console.debug('[network_detection.ts] Network condition: OFFLINE');
    return NetworkCondition.OFFLINE;
  }
  
  const speed = await testNetworkSpeed();
  
  // Consider network slow if response time > 2000ms
  if (speed > 2000) {
    console.debug(`[network_detection.ts] Network condition: SLOW (${speed.toFixed(0)}ms)`);
    return NetworkCondition.SLOW;
  }
  
  console.debug(`[network_detection.ts] Network condition: ONLINE (${speed.toFixed(0)}ms)`);
  return NetworkCondition.ONLINE;
}

/**
 * Gets the appropriate relay sets based on network condition
 * @param networkCondition The detected network condition
 * @param discoveredLocalRelays Array of discovered local relay URLs
 * @param lowbandwidthRelays Array of low bandwidth relay URLs
 * @param fullRelaySet The complete relay set for normal conditions
 * @returns Object with inbox and outbox relay arrays
 */
export function getRelaySetForNetworkCondition(
  networkCondition: NetworkCondition,
  discoveredLocalRelays: string[],
  lowbandwidthRelays: string[],
  fullRelaySet: { inboxRelays: string[]; outboxRelays: string[] }
): { inboxRelays: string[]; outboxRelays: string[] } {
  switch (networkCondition) {
    case NetworkCondition.OFFLINE:
      // When offline, use local relays if available, otherwise rely on cache
      // This will be improved when IndexedDB local relay is implemented
      if (discoveredLocalRelays.length > 0) {
        console.debug('[network_detection.ts] Using local relays (offline)');
        return {
          inboxRelays: discoveredLocalRelays,
          outboxRelays: discoveredLocalRelays
        };
      } else {
        console.debug('[network_detection.ts] No local relays available, will rely on cache (offline)');
        return {
          inboxRelays: [],
          outboxRelays: []
        };
      }
    case NetworkCondition.SLOW: {
      // Local relays + low bandwidth relays when slow (deduplicated)
      console.debug('[network_detection.ts] Using local + low bandwidth relays (slow network)');
      const slowInboxRelays = deduplicateRelayUrls([...discoveredLocalRelays, ...lowbandwidthRelays]);
      const slowOutboxRelays = deduplicateRelayUrls([...discoveredLocalRelays, ...lowbandwidthRelays]);
      return {
        inboxRelays: slowInboxRelays,
        outboxRelays: slowOutboxRelays
      };
    }
    case NetworkCondition.ONLINE:
    default:
      // Full relay set when online
      console.debug('[network_detection.ts] Using full relay set (online)');
      return fullRelaySet;
  }
}

/**
 * Starts periodic network monitoring with reduced frequency to avoid spam
 * @param onNetworkChange Callback function called when network condition changes
 * @param checkInterval Interval in milliseconds between network checks (default: 60 seconds)
 * @returns Function to stop the monitoring
 */
export function startNetworkMonitoring(
  onNetworkChange: (condition: NetworkCondition) => void,
  checkInterval: number = 60000, // Increased to 60 seconds to reduce spam
): () => void {
  let lastCondition: NetworkCondition | null = null;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const checkNetwork = async () => {
    try {
      const currentCondition = await detectNetworkCondition();
      
      if (currentCondition !== lastCondition) {
        console.debug(`[network_detection.ts] Network condition changed: ${lastCondition} -> ${currentCondition}`);
        lastCondition = currentCondition;
        onNetworkChange(currentCondition);
      }
    } catch (error) {
      console.warn('[network_detection.ts] Network monitoring error:', error);
    }
  };

  // Initial check
  checkNetwork();

  // Set up periodic monitoring
  intervalId = globalThis.setInterval(checkNetwork, checkInterval);

  // Return function to stop monitoring
  return () => {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };
} 