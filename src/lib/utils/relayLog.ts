import { get } from 'svelte/store';
import { selectedRelayGroup } from '$lib/utils/relayGroupUtils';
import { relayGroup, useFallbackRelays, includeLocalRelays } from '$lib/stores/relayGroup';
import { userInboxRelays, userOutboxRelays, responsiveLocalRelays } from '$lib/stores/relayStore';

/**
 * Logs all relay settings with a context label.
 * @param context - The context in which the log is made (e.g., 'login', 'logout', 'settings', 'page open').
 */
export function logCurrentRelays(context: string) {
  const log = {
    relayGroup: get(relayGroup),
    useFallbackRelays: get(useFallbackRelays),
    includeLocalRelays: get(includeLocalRelays),
    userInboxRelays: get(userInboxRelays),
    userOutboxRelays: get(userOutboxRelays),
    responsiveLocalRelays: get(responsiveLocalRelays),
    selectedRelayGroup: get(selectedRelayGroup),
  };
  console.log(`[Relays][${context}]`, log);
} 