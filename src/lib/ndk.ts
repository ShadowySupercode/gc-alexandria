import NDK from '@nostr-dev-kit/ndk';
import { writable, type Writable } from 'svelte/store';

export const ndkInstance: Writable<NDK> = writable();

export const ndkSignedIn: Writable<boolean> = writable(false);
