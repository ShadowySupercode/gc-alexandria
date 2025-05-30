import { writable } from 'svelte/store';

export interface DisplayLimits {
  max30040: number; // -1 for unlimited
  max30041: number; // -1 for unlimited
  fetchIfNotFound: boolean;
}

// Create the store with default values
export const displayLimits = writable<DisplayLimits>({
  max30040: -1, // Show all publication indices by default
  max30041: -1, // Show all content by default
  fetchIfNotFound: false // Don't fetch missing events by default
});

// Helper to check if limits are active
export function hasActiveLimits(limits: DisplayLimits): boolean {
  return limits.max30040 !== -1 || limits.max30041 !== -1;
}