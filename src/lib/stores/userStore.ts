import { writable } from 'svelte/store';
import type { NostrUser } from '$lib/types/nostr';
import { getNostrClient } from '$lib/nostr/client';
import { getUserMetadata } from '$lib/utils/profileUtils';
import { userInboxRelays, userOutboxRelays } from '$lib/stores/relayStore';
import type { NostrProfile } from '$lib/utils/types';
import { selectedRelayGroup } from '$lib/utils/relayGroupUtils';
import { get } from 'svelte/store';

/**
 * Gets the initial user state from localStorage if available
 * @returns The stored NostrUser or null if not found/invalid
 */
function getInitialUser(): NostrUser | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }

  const stored = localStorage.getItem('nostrUser');
  if (!stored) {
    return null;
  }

  try {
    return JSON.parse(stored);
  } catch (e) {
    console.error('[userStore] Failed to parse stored user:', e);
    return null;
  }
}

// Create the user store with initial state
export const userStore = writable<NostrUser | null>(getInitialUser());

// Create a derived store for the user's profile
export const userProfile = writable<NostrProfile | null>(null);

// Subscribe to changes and persist to localStorage
userStore.subscribe((user) => {
  if (typeof localStorage === 'undefined') {
    return;
  }

  if (user) {
    localStorage.setItem('nostrUser', JSON.stringify(user));
  } else {
    localStorage.removeItem('nostrUser');
  }
});

// Subscribe to user changes and update client state
userStore.subscribe(async (user) => {
  const client = getNostrClient(get(selectedRelayGroup).inbox);
  
  // If userStore is set but client.getActiveUser() is not, rehydrate session
  if (user && !client.getActiveUser()) {
    try {
      // Set active user in client
      client.setActiveUser(user);

      // Fetch and set user relays
      const [inboxSet, outboxSet] = await client.getUserPreferredRelays(user);
      userInboxRelays.set(Array.from(inboxSet));
      userOutboxRelays.set(Array.from(outboxSet));

      // Fetch and set user profile
      const metadata = await getUserMetadata(user.pubkey);
      userProfile.set(metadata);
    } catch (error) {
      console.error('[userStore] Failed to rehydrate user session:', error);
      // Reset stores on error
      userStore.set(null);
      userProfile.set(null);
      userInboxRelays.set([]);
      userOutboxRelays.set([]);
    }
  } else if (!user) {
    // Clear all user-related stores when user is null
    userProfile.set(null);
    userInboxRelays.set([]);
    userOutboxRelays.set([]);
  }
});
