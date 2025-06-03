import { writable } from 'svelte/store';

/**
 * Store for unresponsive relays, persisted in sessionStorage.
 * Automatically clears when the browser session ends.
 */
function createUnresponsiveRelaysStore() {
  let initial: string[] = [];
  if (typeof sessionStorage !== 'undefined') {
    const stored = sessionStorage.getItem('unresponsiveRelays');
    initial = stored ? JSON.parse(stored) : [];
  }
  const { subscribe, set, update } = writable<string[]>(initial);

  subscribe((value) => {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('unresponsiveRelays', JSON.stringify(value));
    }
  });

  return {
    subscribe,
    add: (relay: string) =>
      update((relays) => (relays.includes(relay) ? relays : [...relays, relay])),
    clear: () => set([]),
  };
}

export const unresponsiveRelays = createUnresponsiveRelaysStore();
