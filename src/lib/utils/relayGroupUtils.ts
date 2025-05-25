import { get } from 'svelte/store';
import { relayGroup } from '$lib/stores/relayGroup';
import { standardRelays } from '$lib/consts';
import { userRelays } from '$lib/stores/relayStore';
import { ndkInstance, ndkSignedIn } from '$lib/ndk';
import { NDKEvent } from '@nostr-dev-kit/ndk';

/**
 * Returns the currently selected relay list based on the global relay group store.
 * Only allows user relays if the user is signed in.
 */
export function selectRelayGroup(): string[] {
  const group = get(relayGroup);
  if (group === 'community' || !get(ndkSignedIn)) {
    return standardRelays;
  } else {
    return get(userRelays);
  }
}

/**
 * Sets the relay group globally.
 */
export function setRelayGroup(group: 'community' | 'user') {
  relayGroup.set(group);
}

/**
 * Ensures the given event is an NDKEvent instance.
 */
export function ensureNDKEvent(event: any): NDKEvent {
  return event instanceof NDKEvent ? event : new NDKEvent(get(ndkInstance), event);
} 