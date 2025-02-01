import { writable } from 'svelte/store';
import { browser } from '$app/environment';

// Initialize from localStorage if available
const storedKey = browser ? window.localStorage.getItem('anthropic_api_key') : null;

export const apiKey = writable<string>(storedKey || '');
export const advancedMode = writable<boolean>(false);

// Subscribe to changes and update localStorage
if (browser) {
    apiKey.subscribe((value) => {
        if (value) {
            window.localStorage.setItem('anthropic_api_key', value);
        } else {
            window.localStorage.removeItem('anthropic_api_key');
        }
    });
}