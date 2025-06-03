import { get } from 'svelte/store';
import { selectedRelayGroup } from '$lib/utils/relayGroupUtils';
import { relayGroup, useFallbackRelays, includeLocalRelays } from '$lib/stores/relayGroup';
import { userInboxRelays, userOutboxRelays, responsiveLocalRelays, blockedRelays, blockedRelaysHydrated } from '$lib/stores/relayStore';
import { userHydrated } from '$lib/stores/userStore';

/**
 * Logs all relay settings with a context label.
 * @param context - The context in which the log is made (e.g., 'login', 'logout', 'settings', 'page open').
 */
export function logCurrentRelays(context: string) {
  if (context === 'page open') {
    const unsubUser = userHydrated.subscribe((userReady) => {
      if (userReady) {
        const unsubBlocked = blockedRelaysHydrated.subscribe((blockedReady) => {
          if (blockedReady) {
            const log = {
              relayGroup: get(relayGroup),
              useFallbackRelays: get(useFallbackRelays),
              includeLocalRelays: get(includeLocalRelays),
              userInboxRelays: get(userInboxRelays),
              userOutboxRelays: get(userOutboxRelays),
              responsiveLocalRelays: get(responsiveLocalRelays),
              selectedRelayGroup: get(selectedRelayGroup),
              blockedRelays: get(blockedRelays),
            };
            console.log(`[Relays][${context}]`, log);
            unsubUser();
            unsubBlocked();
          }
        });
      }
    });
  } else {
    const log = {
      relayGroup: get(relayGroup),
      useFallbackRelays: get(useFallbackRelays),
      includeLocalRelays: get(includeLocalRelays),
      userInboxRelays: get(userInboxRelays),
      userOutboxRelays: get(userOutboxRelays),
      responsiveLocalRelays: get(responsiveLocalRelays),
      selectedRelayGroup: get(selectedRelayGroup),
      blockedRelays: get(blockedRelays),
    };
    console.log(`[Relays][${context}]`, log);
  }
} 