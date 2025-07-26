import NDK, { NDKUser } from "@nostr-dev-kit/ndk";
import { RelayManagementService } from "../services/relay_management_service.ts";

// Re-export all functions from the service for backward compatibility
export const {
  testRelayConnection,
  buildCompleteRelaySet,
  getSearchRelaySet,
  getAllPossibleRelays,
  getUserLocalRelays,
  getUserBlockedRelays,
  getUserOutboxRelays,
  getExtensionRelays,
  discoverLocalRelays,
  testRelaySet,
  normalizeRelayUrl,
  normalizeRelayUrls,
  deduplicateRelayUrls
} = RelayManagementService;

/**
 * Legacy function for backward compatibility
 * @deprecated Use RelayManagementService.getWorkingRelays instead
 */
export function getWorkingRelays(): string[] {
  console.warn('[relay_management.ts] getWorkingRelays() called without parameters. This function now requires NDK and user parameters. Use RelayManagementService.getWorkingRelays(ndk, user) instead.');
  return [];
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use RelayManagementService.initializeRelayStores instead
 */
export function initializeRelayStores(
  activeInboxRelays: any,
  activeOutboxRelays: any
): void {
  console.warn('[relay_management.ts] initializeRelayStores() called without NDK and user parameters. This function now requires NDK and user parameters. Use RelayManagementService.initializeRelayStores(activeInboxRelays, activeOutboxRelays, ndk, user) instead.');
  activeInboxRelays.set([]);
  activeOutboxRelays.set([]);
} 