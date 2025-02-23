import { writable } from 'svelte/store';
import { browser } from '$app/environment';

// Load saved values from localStorage if available
const storedKey = browser ? localStorage.getItem('anthropic_api_key') : null;
const storedAdvancedMode = browser ? localStorage.getItem('advanced_mode') === 'true' : false;

// Create the stores
export const apiKey = writable<string>(storedKey || '');
export const advancedMode = writable<boolean>(storedAdvancedMode);

// Save to localStorage when values change
if (browser) {
    apiKey.subscribe(value => {
        if (value) {
            localStorage.setItem('anthropic_api_key', value);
        } else {
            localStorage.removeItem('anthropic_api_key');
        }
    });

    advancedMode.subscribe(value => {
        localStorage.setItem('advanced_mode', value.toString());
    });
}