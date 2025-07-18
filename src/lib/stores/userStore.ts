import { writable, get } from 'svelte/store';
import type { NostrProfile } from '$lib/utils/nostrUtils';
import type { NDKUser, NDKSigner } from '@nostr-dev-kit/ndk';
import { NDKNip07Signer, NDKRelayAuthPolicies, NDKRelaySet, NDKRelay } from '@nostr-dev-kit/ndk';
import { getUserMetadata } from '$lib/utils/nostrUtils';
import { ndkInstance } from '$lib/ndk';
import { loginStorageKey, fallbackRelays } from '$lib/consts';
import { nip19 } from 'nostr-tools';

export interface UserState {
  pubkey: string | null;
  npub: string | null;
  profile: NostrProfile | null;
  relays: { inbox: string[]; outbox: string[] };
  loginMethod: 'extension' | 'amber' | 'npub' | null;
  ndkUser: NDKUser | null;
  signer: NDKSigner | null;
  signedIn: boolean;
}

export const userStore = writable<UserState>({
  pubkey: null,
  npub: null,
  profile: null,
  relays: { inbox: [], outbox: [] },
  loginMethod: null,
  ndkUser: null,
  signer: null,
  signedIn: false,
});

// Helper functions for relay management
function getRelayStorageKey(user: NDKUser, type: 'inbox' | 'outbox'): string {
  return `${loginStorageKey}/${user.pubkey}/${type}`;
}

function persistRelays(user: NDKUser, inboxes: Set<NDKRelay>, outboxes: Set<NDKRelay>): void {
  localStorage.setItem(
    getRelayStorageKey(user, 'inbox'),
    JSON.stringify(Array.from(inboxes).map(relay => relay.url))
  );
  localStorage.setItem(
    getRelayStorageKey(user, 'outbox'), 
    JSON.stringify(Array.from(outboxes).map(relay => relay.url))
  );
}

function getPersistedRelays(user: NDKUser): [Set<string>, Set<string>] {
  const inboxes = new Set<string>(
    JSON.parse(localStorage.getItem(getRelayStorageKey(user, 'inbox')) ?? '[]')
  );
  const outboxes = new Set<string>(
    JSON.parse(localStorage.getItem(getRelayStorageKey(user, 'outbox')) ?? '[]')
  );

  return [inboxes, outboxes];
}

async function getUserPreferredRelays(
  ndk: any,
  user: NDKUser,
  fallbacks: readonly string[] = fallbackRelays
): Promise<[Set<NDKRelay>, Set<NDKRelay>]> {
  const relayList = await ndk.fetchEvent(
    {
      kinds: [10002],
      authors: [user.pubkey],
    },
    { 
      groupable: false,
      skipVerification: false,
      skipValidation: false,
    },
    NDKRelaySet.fromRelayUrls(fallbacks, ndk),
  );

  const inboxRelays = new Set<NDKRelay>();
  const outboxRelays = new Set<NDKRelay>();

  if (relayList == null) {
    const relayMap = await window.nostr?.getRelays?.();
    Object.entries(relayMap ?? {}).forEach(([url, relayType]: [string, any]) => {
      const relay = new NDKRelay(url, NDKRelayAuthPolicies.signIn({ ndk }), ndk);
      if (relayType.read) inboxRelays.add(relay);
      if (relayType.write) outboxRelays.add(relay);
    });
  } else {
    relayList.tags.forEach((tag: string[]) => {
      switch (tag[0]) {
        case 'r':
          inboxRelays.add(new NDKRelay(tag[1], NDKRelayAuthPolicies.signIn({ ndk }), ndk));
          break;
        case 'w':
          outboxRelays.add(new NDKRelay(tag[1], NDKRelayAuthPolicies.signIn({ ndk }), ndk));
          break;
        default:
          inboxRelays.add(new NDKRelay(tag[1], NDKRelayAuthPolicies.signIn({ ndk }), ndk));
          outboxRelays.add(new NDKRelay(tag[1], NDKRelayAuthPolicies.signIn({ ndk }), ndk));
          break;
      }
    });
  }

  return [inboxRelays, outboxRelays];
}

// --- Unified login/logout helpers ---

export const loginMethodStorageKey = 'alexandria/login/method';

function persistLogin(user: NDKUser, method: 'extension' | 'amber' | 'npub') {
  localStorage.setItem(loginStorageKey, user.pubkey);
  localStorage.setItem(loginMethodStorageKey, method);
}

function getPersistedLoginMethod(): 'extension' | 'amber' | 'npub' | null {
  return (localStorage.getItem(loginMethodStorageKey) as 'extension' | 'amber' | 'npub') ?? null;
}

function clearLogin() {
  localStorage.removeItem(loginStorageKey);
  localStorage.removeItem(loginMethodStorageKey);
}

/**
 * Login with NIP-07 browser extension
 */
export async function loginWithExtension() {
  const ndk = get(ndkInstance);
  if (!ndk) throw new Error('NDK not initialized');
  // Only clear previous login state after successful login
  const signer = new NDKNip07Signer();
  const user = await signer.user();
  const npub = user.npub;
  const profile = await getUserMetadata(npub);
  // Fetch user's preferred relays
  const [persistedInboxes, persistedOutboxes] = getPersistedRelays(user);
  for (const relay of persistedInboxes) {
    ndk.addExplicitRelay(relay);
  }
  const [inboxes, outboxes] = await getUserPreferredRelays(ndk, user);
  persistRelays(user, inboxes, outboxes);
  ndk.signer = signer;
  ndk.activeUser = user;
  userStore.set({
    pubkey: user.pubkey,
    npub,
    profile,
    relays: {
      inbox: Array.from(inboxes ?? persistedInboxes).map(relay => relay.url),
      outbox: Array.from(outboxes ?? persistedOutboxes).map(relay => relay.url)
    },
    loginMethod: 'extension',
    ndkUser: user,
    signer,
    signedIn: true,
  });
  clearLogin();
  localStorage.removeItem('alexandria/logout/flag');
  persistLogin(user, 'extension');
}

/**
 * Login with Amber (NIP-46)
 */
export async function loginWithAmber(amberSigner: NDKSigner, user: NDKUser) {
  const ndk = get(ndkInstance);
  if (!ndk) throw new Error('NDK not initialized');
  // Only clear previous login state after successful login
  const npub = user.npub;
  const profile = await getUserMetadata(npub, true); // Force fresh fetch
  const [persistedInboxes, persistedOutboxes] = getPersistedRelays(user);
  for (const relay of persistedInboxes) {
    ndk.addExplicitRelay(relay);
  }
  const [inboxes, outboxes] = await getUserPreferredRelays(ndk, user);
  persistRelays(user, inboxes, outboxes);
  ndk.signer = amberSigner;
  ndk.activeUser = user;
  userStore.set({
    pubkey: user.pubkey,
    npub,
    profile,
    relays: {
      inbox: Array.from(inboxes ?? persistedInboxes).map(relay => relay.url),
      outbox: Array.from(outboxes ?? persistedOutboxes).map(relay => relay.url)
    },
    loginMethod: 'amber',
    ndkUser: user,
    signer: amberSigner,
    signedIn: true,
  });
  clearLogin();
  localStorage.removeItem('alexandria/logout/flag');
  persistLogin(user, 'amber');
}

/**
 * Login with npub (read-only)
 */
export async function loginWithNpub(pubkeyOrNpub: string) {
  const ndk = get(ndkInstance);
  if (!ndk) throw new Error('NDK not initialized');
  // Only clear previous login state after successful login
  let hexPubkey: string;
  if (pubkeyOrNpub.startsWith('npub')) {
    try {
      hexPubkey = nip19.decode(pubkeyOrNpub).data as string;
    } catch (e) {
      console.error('Failed to decode hex pubkey from npub:', pubkeyOrNpub, e);
      throw e;
    }
  } else {
    hexPubkey = pubkeyOrNpub;
  }
  let npub: string;
  try {
    npub = nip19.npubEncode(hexPubkey);
  } catch (e) {
    console.error('Failed to encode npub from hex pubkey:', hexPubkey, e);
    throw e;
  }
  const user = ndk.getUser({ npub });
  const profile = await getUserMetadata(npub);
  ndk.signer = undefined;
  ndk.activeUser = user;
  userStore.set({
    pubkey: user.pubkey,
    npub,
    profile,
    relays: { inbox: [], outbox: [] },
    loginMethod: 'npub',
    ndkUser: user,
    signer: null,
    signedIn: true,
  });
  clearLogin();
  localStorage.removeItem('alexandria/logout/flag');
  persistLogin(user, 'npub');
}

/**
 * Logout and clear all user state
 */
export function logoutUser() {
  console.log('Logging out user...');
  const currentUser = get(userStore);
  if (currentUser.ndkUser) {
    // Clear persisted relays for the user
    localStorage.removeItem(getRelayStorageKey(currentUser.ndkUser, 'inbox'));
    localStorage.removeItem(getRelayStorageKey(currentUser.ndkUser, 'outbox'));
  }
  
  // Clear all possible login states from localStorage
  clearLogin();
  
  // Also clear any other potential login keys that might exist
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.includes('login') || key.includes('nostr') || key.includes('user') || key.includes('alexandria') || key === 'pubkey')) {
      keysToRemove.push(key);
    }
  }
  
  // Specifically target the login storage key
  keysToRemove.push('alexandria/login/pubkey');
  keysToRemove.push('alexandria/login/method');
  
  keysToRemove.forEach(key => {
    console.log('Removing localStorage key:', key);
    localStorage.removeItem(key);
  });
  
  // Clear Amber-specific flags
  localStorage.removeItem('alexandria/amber/fallback');
  
  // Set a flag to prevent auto-login on next page load
  localStorage.setItem('alexandria/logout/flag', 'true');
  
  console.log('Cleared all login data from localStorage');
  
  userStore.set({
    pubkey: null,
    npub: null,
    profile: null,
    relays: { inbox: [], outbox: [] },
    loginMethod: null,
    ndkUser: null,
    signer: null,
    signedIn: false,
  });
  
  const ndk = get(ndkInstance);
  if (ndk) {
    ndk.activeUser = undefined;
    ndk.signer = undefined;
  }
  
  console.log('Logout complete');
} 