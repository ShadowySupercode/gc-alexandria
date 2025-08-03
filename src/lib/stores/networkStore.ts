import { writable } from "svelte/store";
import { detectNetworkCondition, NetworkCondition, startNetworkMonitoring } from '../utils/network_detection.ts';

// Network status store
export const networkCondition = writable<NetworkCondition>(NetworkCondition.ONLINE);
export const isNetworkChecking = writable<boolean>(false);

// Network monitoring state
let stopNetworkMonitoring: (() => void) | null = null;

/**
 * Starts network monitoring if not already running
 */
export function startNetworkStatusMonitoring(): void {
  if (stopNetworkMonitoring) {
    return; // Already monitoring
  }

  console.debug('[networkStore.ts] Starting network status monitoring');
  
  stopNetworkMonitoring = startNetworkMonitoring(
    (condition: NetworkCondition) => {
      console.debug(`[networkStore.ts] Network condition changed to: ${condition}`);
      networkCondition.set(condition);
    },
    60000 // Check every 60 seconds to reduce spam
  );
}

/**
 * Stops network monitoring
 */
export function stopNetworkStatusMonitoring(): void {
  if (stopNetworkMonitoring) {
    console.debug('[networkStore.ts] Stopping network status monitoring');
    stopNetworkMonitoring();
    stopNetworkMonitoring = null;
  }
}

/**
 * Manually check network status (for immediate updates)
 */
export async function checkNetworkStatus(): Promise<void> {
  try {
    isNetworkChecking.set(true);
    const condition = await detectNetworkCondition();
    networkCondition.set(condition);
  } catch (error) {
    console.warn('[networkStore.ts] Failed to check network status:', error);
    networkCondition.set(NetworkCondition.OFFLINE);
  } finally {
    isNetworkChecking.set(false);
  }
} 