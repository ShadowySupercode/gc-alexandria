import { writable } from "svelte/store";

/**
 * Global relay group selection for the user. Use 'community' for community relays, 'user' for user relays.
 */
export const relayGroup = writable<"community" | "user">("community");
