import { writable } from 'svelte/store';
import type { NostrClient } from '$lib/types/nostr';

/**
 * Global store for the Nostr client instance
 */
export const nostrClient = writable<NostrClient | null>(null); 