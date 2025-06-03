import { derived, get } from 'svelte/store';
import { relayGroup, includeLocalRelays, useFallbackRelays } from '$lib/stores/relayGroup';
import { communityRelays, fallbackRelays } from '$lib/consts';
import { userInboxRelays, userOutboxRelays, responsiveLocalRelays } from '$lib/stores/relayStore';
import { getNostrClient } from '$lib/nostr/client';
import type { NostrEvent, NostrRelaySet } from '$lib/types/nostr';

interface RelayGroupState {
  inbox: string[];
  outbox: string[];
}

/**
 * Derived store that provides the currently selected relay list for reading/searching (inbox relays) 
 * or publishing (outbox relays). Respects relay group, local relays, and fallback relays settings.
 */
export const selectedRelayGroup = derived<[
  typeof relayGroup,
  typeof userInboxRelays,
  typeof userOutboxRelays,
  typeof responsiveLocalRelays,
  typeof includeLocalRelays,
  typeof useFallbackRelays
], RelayGroupState>(
  [relayGroup, userInboxRelays, userOutboxRelays, responsiveLocalRelays, includeLocalRelays, useFallbackRelays],
  ([$relayGroup, $userInboxRelays, $userOutboxRelays, $liveLocalRelays, $includeLocalRelays, $useFallbackRelays], set) => {
    const getRelays = (kind: 'inbox' | 'outbox'): string[] => {
      const relayGroupSelection = $relayGroup[0];
      const userRelays = kind === 'inbox' ? $userInboxRelays : $userOutboxRelays;
      let relays: string[] = [];

      if (relayGroupSelection === 'user') {
        relays = userRelays;
      } else if (relayGroupSelection === 'community') {
        relays = communityRelays;
      } else if (relayGroupSelection === 'both') {
        relays = [...communityRelays, ...userRelays];
      } else if (relayGroupSelection === 'localOnly') {
        relays = $liveLocalRelays;
      }

      if ($includeLocalRelays && relayGroupSelection !== 'localOnly') {
        relays = [...relays, ...$liveLocalRelays];
      }

      if ($useFallbackRelays) {
        relays = [...relays, ...fallbackRelays];
      }

      // Remove duplicates and normalize
      return Array.from(new Set(relays.map(url => url.replace(/\/+$/, ''))));
    };

    set({
      inbox: getRelays('inbox'),
      outbox: getRelays('outbox')
    });
  },
  { inbox: [], outbox: [] }
);

/**
 * Sets the relay group globally (legacy single value).
 */
export function setRelayGroup(group: 'community' | 'user'): void {
  relayGroup.set([group]);
}

/**
 * Ensures the given event is a NostrEvent instance.
 */
export function ensureNostrEvent(event: unknown): NostrEvent {
  if (!event || typeof event !== 'object') {
    throw new Error('Invalid event: not an object');
  }
  return event as NostrEvent;
}

/**
 * Ensures the given event is a valid NDK event by checking required fields and types.
 * @param event The event to validate
 * @returns The validated event
 * @throws Error if the event is invalid
 */
export function ensureNDKEvent(event: unknown): NostrEvent {
  if (!event || typeof event !== 'object') {
    throw new Error('Invalid event: not an object');
  }

  const ndkEvent = event as NostrEvent;

  // Check required fields
  if (!ndkEvent.id || !ndkEvent.pubkey || !ndkEvent.created_at || !ndkEvent.kind || !ndkEvent.tags || !ndkEvent.content || !ndkEvent.sig) {
    throw new Error('Invalid event: missing required fields');
  }

  // Check field types
  if (
    typeof ndkEvent.id !== 'string' ||
    typeof ndkEvent.pubkey !== 'string' ||
    typeof ndkEvent.created_at !== 'number' ||
    typeof ndkEvent.kind !== 'number' ||
    !Array.isArray(ndkEvent.tags) ||
    typeof ndkEvent.content !== 'string' ||
    typeof ndkEvent.sig !== 'string'
  ) {
    throw new Error('Invalid event: invalid field types');
  }

  // Check created_at is not in the future
  if (ndkEvent.created_at > Math.floor(Date.now() / 1000) + 60) {
    throw new Error('Invalid event: created_at is in the future');
  }

  // Check kind is valid
  if (ndkEvent.kind < 0) {
    throw new Error('Invalid event: invalid kind');
  }

  // Check tags are valid
  if (!ndkEvent.tags.every(tag => Array.isArray(tag) && tag.every(item => typeof item === 'string'))) {
    throw new Error('Invalid event: invalid tags');
  }

  return ndkEvent;
}

/**
 * Selects a group of relays based on the specified type.
 * This function combines both legacy and new relay selection logic.
 * @param type The type of relay group to select ('inbox', 'outbox', or 'all')
 * @returns An array of relay URLs
 */
export function selectRelayGroup(type: 'inbox' | 'outbox' | 'all' = 'all'): string[] {
  // Get the current relay group state
  const { inbox, outbox } = get(selectedRelayGroup);
  const client = getNostrClient();
  const user = client.getActiveUser();
  const userRelays = user ? get(userInboxRelays) : [];
  const userOutbox = user ? get(userOutboxRelays) : [];
  const localRelays = get(responsiveLocalRelays);

  // For legacy 'inbox' and 'outbox' types, use the selected relay group
  if (type === 'inbox') {
    return inbox;
  }
  if (type === 'outbox') {
    return outbox;
  }

  // For 'all' type, combine all available relays
  return [...new Set([...userRelays, ...userOutbox, ...localRelays, ...communityRelays, ...fallbackRelays])];
}

/**
 * Creates a relay set for the specified group type.
 * @param type The type of relay group to create ('inbox', 'outbox', or 'all')
 * @returns A NostrRelaySet instance
 */
export function createRelaySet(type: 'inbox' | 'outbox' | 'all' = 'all'): NostrRelaySet {
  const client = getNostrClient(get(selectedRelayGroup).inbox);
  const relayUrls = selectRelayGroup(type);
  return client.getRelaySet(relayUrls);
}