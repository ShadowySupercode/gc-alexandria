import { getNostrClient } from '$lib/nostr/client';
import type { NostrUser } from '$lib/types/nostr';
import { browser } from '$app/environment';

const STORAGE_KEYS = {
  LOGIN: 'nostr_login',
  RELAYS: 'nostr_relays'
} as const;

// User management
export async function getActiveUser(): Promise<NostrUser | null> {
  const client = getNostrClient();
  return client.getActiveUser();
}

export function activePubkey(): string | null {
  const user = getNostrClient().getActiveUser();
  return user?.pubkey || null;
}

// Authentication
export async function loginWithExtension(): Promise<void> {
  if (!browser) {
    throw new Error('WebExtension login is only available in browser environment');
  }

  // Check if window.nostr is available
  if (!window.nostr) {
    throw new Error('Nostr WebExtension not found. Please install a Nostr WebExtension like Alby or nos2x.');
  }

  try {
    // Request public key from extension
    const pubkey = await window.nostr.getPublicKey();
    if (!pubkey) {
      throw new Error('Failed to get public key from extension');
    }

    // Get user metadata
    const client = getNostrClient();
    const user = await client.getUser(pubkey);
    if (!user) {
      throw new Error('Failed to fetch user metadata');
    }

    // Set active user
    client.setActiveUser(user);

    // Get user's preferred relays
    const [inbox, outbox] = await client.getUserPreferredRelays(user);
    const userRelays = Array.from(new Set([...inbox, ...outbox]));

    // Persist login and relays
    persistLogin();
    persistRelays(userRelays);

    return;
  } catch (error) {
    console.error('WebExtension login failed:', error);
    throw error;
  }
}

export function logout(): void {
  const client = getNostrClient();
  client.setActiveUser(null);
  clearLogin();
  clearPersistedRelays();
}

// Persistence
export function persistLogin(): void {
  if (!browser) return;

  const user = getNostrClient().getActiveUser();
  if (!user) return;

  try {
    localStorage.setItem(STORAGE_KEYS.LOGIN, JSON.stringify({
      pubkey: user.pubkey,
      timestamp: Date.now()
    }));
  } catch (error) {
    console.error('Failed to persist login:', error);
  }
}

export function clearLogin(): void {
  if (!browser) return;
  localStorage.removeItem(STORAGE_KEYS.LOGIN);
}

export function getPersistedLogin(): { pubkey: string; relays: string[] } | null {
  if (!browser) return null;

  try {
    const loginData = localStorage.getItem(STORAGE_KEYS.LOGIN);
    if (!loginData) return null;

    const { pubkey, timestamp } = JSON.parse(loginData);
    const relays = getPersistedRelays();

    // Check if login is expired (24 hours)
    if (Date.now() - timestamp > 24 * 60 * 60 * 1000) {
      clearLogin();
      return null;
    }

    return { pubkey, relays };
  } catch (error) {
    console.error('Failed to get persisted login:', error);
    return null;
  }
}

export function persistRelays(relays: string[]): void {
  if (!browser) return;

  try {
    localStorage.setItem(STORAGE_KEYS.RELAYS, JSON.stringify(relays));
  } catch (error) {
    console.error('Failed to persist relays:', error);
  }
}

export function clearPersistedRelays(): void {
  if (!browser) return;
  localStorage.removeItem(STORAGE_KEYS.RELAYS);
}

export function getPersistedRelays(): string[] {
  if (!browser) return [];

  try {
    const relays = localStorage.getItem(STORAGE_KEYS.RELAYS);
    return relays ? JSON.parse(relays) : [];
  } catch (error) {
    console.error('Failed to get persisted relays:', error);
    return [];
  }
}

export function getActiveRelays(): string[] {
  return getNostrClient().getConnectedRelays();
}

/**
 * Initialize the Nostr client with the given relays
 * @param relays Optional list of relay URLs to connect to
 */
export async function initNostrClient(relays: string[] = []): Promise<void> {
  const client = getNostrClient(relays);
  
  // Try to restore persisted login
  const persistedLogin = getPersistedLogin();
  if (persistedLogin) {
    const user = await client.getUser(persistedLogin.pubkey);
    if (user) {
      client.setActiveUser(user);
      // Use persisted relays if available, otherwise use provided relays
      const userRelays = persistedLogin.relays.length > 0 ? persistedLogin.relays : relays;
      await client.connect();
    }
  } else {
    await client.connect();
  }
}

// Export the NostrClient for use throughout the application
export { getNostrClient } from '$lib/nostr/client';

export { publishEvent, fetchEventWithFallback } from './relayUtils'; 