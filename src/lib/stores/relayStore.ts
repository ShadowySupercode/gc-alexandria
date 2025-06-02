import { writable } from "svelte/store";

// User relay stores
export const userInboxRelays = writable<string[]>([]);
export const userOutboxRelays = writable<string[]>([]);

// Store for responsive local relays
export const responsiveLocalRelays = writable<string[]>([]);

// Helper function to update responsive local relays
export function updateResponsiveLocalRelays(relays: string[]) {
  responsiveLocalRelays.set(relays);
}
