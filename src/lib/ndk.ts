import { browser } from '$app/environment';
import NDK from '@nostr-dev-kit/ndk';
import { writable, type Writable } from 'svelte/store';
import { standardRelays } from './consts';

export const ndkInstance: Writable<NDK> = writable();

export const ndkSignedIn: Writable<boolean> = writable(false);
