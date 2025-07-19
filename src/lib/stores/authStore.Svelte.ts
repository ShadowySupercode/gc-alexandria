import { writable, derived } from "svelte/store";

/**
 * Stores the user's public key if logged in, or null otherwise.
 */
export const userPubkey = writable<string | null>(null);

/**
 * Derived store indicating if the user is logged in.
 */
export const isLoggedIn = derived(userPubkey, ($userPubkey) => !!$userPubkey);
