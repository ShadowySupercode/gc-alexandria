import { get } from "svelte/store";
import { relayGroup } from "$lib/stores/relayGroup";
import { communityRelays } from "$lib/consts";
import { userRelays } from "$lib/stores/relayStore";
import { ndkInstance, ndkSignedIn } from "$lib/ndk";
import { NDKEvent } from "@nostr-dev-kit/ndk";

/**
 * Returns the currently selected relay list based on the global relay group store.
 * Supports both community and user relays if both are selected.
 */
export function selectRelayGroup(): string[] {
  const groupArr = get(relayGroup);
  const isCommunity = groupArr.includes('community');
  const isUser = groupArr.includes('user') && get(ndkSignedIn);
  let relays: string[] = [];
  if (isCommunity) {
    relays = relays.concat(communityRelays);
  }
  if (isUser) {
    relays = relays.concat(get(userRelays));
  }
  // Remove duplicates
  return Array.from(new Set(relays));
}

/**
 * Sets the relay group globally (legacy single value).
 */
export function setRelayGroup(group: "community" | "user") {
  relayGroup.set([group]);
}

/**
 * Ensures the given event is an NDKEvent instance.
 */
export function ensureNDKEvent(event: any): NDKEvent {
  return event instanceof NDKEvent
    ? event
    : new NDKEvent(get(ndkInstance), event);
}
