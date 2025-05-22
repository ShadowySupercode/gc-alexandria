import { writable } from 'svelte/store';

// Initialize with empty array, will be populated from user preferences
export const userRelays = writable<string[]>([]); 