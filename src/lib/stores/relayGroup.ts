import { writable } from "svelte/store";

/**
 * Global relay group selection for the user. Now supports multiple selections.
 * At least one of 'community' or 'user' must be present.
 */
export type RelayGroupOption = 'community' | 'user' | 'both' | 'localOnly';
export const relayGroup = writable<RelayGroupOption[]>(['community']);

export function setRelayGroupArray(groups: RelayGroupOption[]) {
  // Ensure at least one group is always selected
  if (groups.length === 0) {
    return;
  }
  relayGroup.set(groups);
}

/**
 * Global fallback relays toggle. True if fallback relays should be included.
 */
function getInitialUseFallbackRelays(): boolean {
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem('useFallbackRelays');
    if (stored !== null) {
      return stored === 'true';
    }
  }
  return false;
}

export const useFallbackRelays = writable<boolean>(getInitialUseFallbackRelays());

useFallbackRelays.subscribe((value) => {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('useFallbackRelays', value.toString());
  }
});

export function setUseFallbackRelays(value: boolean) {
  useFallbackRelays.set(value);
}

function getInitialIncludeLocalRelays(): boolean {
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem('includeLocalRelays');
    if (stored !== null) {
      return stored === 'true';
    }
  }
  return false;
}

export const includeLocalRelays = writable<boolean>(getInitialIncludeLocalRelays());

includeLocalRelays.subscribe((value) => {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('includeLocalRelays', value.toString());
  }
});

export function setIncludeLocalRelays(value: boolean) {
  includeLocalRelays.set(value);
}
