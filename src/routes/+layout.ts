import { feedTypeStorageKey } from '$lib/consts';
import { FeedType } from '$lib/consts';
import { getNostrClient } from '$lib/nostr/client';
import Pharos from '$lib/parser';
import { pharosInstance } from '$lib/parser';
import { feedType } from '$lib/stores';
import { nostrClient } from '$lib/stores/nostr';
import type { LayoutLoad } from './$types';
import type { NostrEvent } from '$lib/types/nostr';
import { Buffer } from 'buffer';

// Store for the persisted login state
interface PersistedLogin {
  pubkey: string;
  relays: string[];
}

const PERSISTED_LOGIN_KEY = 'alexandria/persisted-login';

// Disable server-side rendering since we rely on browser APIs
export const ssr = false;

/**
 * Get the persisted login state from local storage
 * @returns The persisted login state if it exists, null otherwise
 */
function getPersistedLogin(): PersistedLogin | null {
  try {
    const stored = localStorage.getItem(PERSISTED_LOGIN_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as PersistedLogin;
  } catch (e) {
    console.warn('Failed to parse persisted login:', e);
    return null;
  }
}

/**
 * Login using the NIP-07 extension
 * @param pubkey The public key to login with
 * @returns A promise that resolves when the login is complete
 */
async function loginWithExtension(pubkey: string): Promise<void> {
  const client = getNostrClient();
  const user = await client.getUser(pubkey);
  if (user) {
    client.setActiveUser(user);
    // Store the login state
    const loginState: PersistedLogin = {
      pubkey,
      relays: client.getConnectedRelays(),
    };
    localStorage.setItem(PERSISTED_LOGIN_KEY, JSON.stringify(loginState));
  }
}

/**
 * Layout load function that initializes the application state
 * @returns The layout data including Nostr client and parser instances
 */
export const load: LayoutLoad = async () => {
  // Initialize feed type from local storage
  const initialFeedType = (localStorage.getItem(feedTypeStorageKey) as FeedType) ?? 
    FeedType.CommunityRelays;
  feedType.set(initialFeedType);

  // Initialize Nostr client
  const client = getNostrClient();
  nostrClient.set(client);

  try {
    // Attempt to restore persisted login
    const persistedLogin = getPersistedLogin();
    if (persistedLogin) {
      // Login will run in background and update stores
      loginWithExtension(persistedLogin.pubkey).catch((error: Error) => {
        console.warn(
          `Failed to login with extension: ${error}\n\nContinuing with anonymous session.`,
        );
      });
    }
  } catch (error: unknown) {
    console.warn(
      `Failed to restore login state: ${error}\n\nContinuing with anonymous session.`,
    );
  }

  // Initialize parser
  const parser = new Pharos();
  pharosInstance.set(parser);

  // Create a dummy index event for the root layout
  const dummyIndexEvent: NostrEvent = {
    id: '',
    pubkey: '',
    created_at: Math.floor(Date.now() / 1000),
    kind: 0,
    tags: [],
    content: '',
    sig: '',
  };

  // Return layout data
  return {
    ndk: client, // Keep ndk name for backward compatibility
    parser,
    client,
    indexEvent: dummyIndexEvent,
    url: new URL(window.location.href),
    publicationType: 'unknown',
    waitable: Promise.resolve(),
  };
};
