import { writable, get } from 'svelte/store';
import type { NostrProfile } from '../utils/search_types.ts';
import type { NDKUser, NDKSigner } from '@nostr-dev-kit/ndk';
import NDK, {
  NDKNip07Signer,
  NDKRelayAuthPolicies,
  NDKRelaySet,
  NDKRelay,
} from '@nostr-dev-kit/ndk';
import { getUserMetadata } from '../utils/nostrUtils.ts';
import { ndkInstance, activeInboxRelays, activeOutboxRelays, updateActiveRelayStores } from '../ndk.ts';
import { loginStorageKey } from '../consts.ts';
import { nip19 } from 'nostr-tools';
import { fetchCurrentUserLists } from '../utils/user_lists.ts';
import { npubCache } from '../utils/npubCache.ts';

// AI-NOTE: UserStore consolidation - This file contains all user-related state management
// including authentication, profile management, relay preferences, and user lists caching.

export type LoginMethod = 'extension' | 'amber' | 'npub';

export interface UserState {
  pubkey: string | null;
  npub: string | null;
  profile: NostrProfile | null;
  relays: { inbox: string[]; outbox: string[] };
  loginMethod: LoginMethod | null;
  ndkUser: NDKUser | null;
  signer: NDKSigner | null;
  signedIn: boolean;
}

const initialUserState: UserState = {
  pubkey: null,
  npub: null,
  profile: null,
  relays: { inbox: [], outbox: [] },
  loginMethod: null,
  ndkUser: null,
  signer: null,
  signedIn: false,
};

export const userStore = writable<UserState>(initialUserState);

// Storage keys
export const loginMethodStorageKey = 'alexandria/login/method';
const LOGOUT_FLAG_KEY = 'alexandria/logout/flag';

// Performance optimization: Cache for relay storage keys
const relayStorageKeyCache = new Map<string, { inbox: string; outbox: string }>();

/**
 * Get relay storage key for a user, with caching for performance
 */
function getRelayStorageKey(user: NDKUser, type: 'inbox' | 'outbox'): string {
  const cacheKey = user.pubkey;
  let cached = relayStorageKeyCache.get(cacheKey);
  
  if (!cached) {
    const baseKey = `${loginStorageKey}/${user.pubkey}`;
    cached = {
      inbox: `${baseKey}/inbox`,
      outbox: `${baseKey}/outbox`,
    };
    relayStorageKeyCache.set(cacheKey, cached);
  }
  
  return type === 'inbox' ? cached.inbox : cached.outbox;
}

/**
 * Safely access localStorage (client-side only)
 */
function safeLocalStorage(): Storage | null {
  return typeof window !== 'undefined' ? window.localStorage : null;
}

/**
 * Persist relay preferences to localStorage
 */
function persistRelays(
  user: NDKUser,
  inboxes: Set<NDKRelay>,
  outboxes: Set<NDKRelay>,
): void {
  const storage = safeLocalStorage();
  if (!storage) return;
  
  const inboxUrls = Array.from(inboxes).map((relay) => relay.url);
  const outboxUrls = Array.from(outboxes).map((relay) => relay.url);
  
  storage.setItem(getRelayStorageKey(user, 'inbox'), JSON.stringify(inboxUrls));
  storage.setItem(getRelayStorageKey(user, 'outbox'), JSON.stringify(outboxUrls));
}

/**
 * Get persisted relay preferences from localStorage
 */
function getPersistedRelays(user: NDKUser): [Set<string>, Set<string>] {
  const storage = safeLocalStorage();
  if (!storage) {
    return [new Set<string>(), new Set<string>()];
  }
  
  const inboxes = new Set<string>(
    JSON.parse(storage.getItem(getRelayStorageKey(user, 'inbox')) ?? '[]'),
  );
  const outboxes = new Set<string>(
    JSON.parse(storage.getItem(getRelayStorageKey(user, 'outbox')) ?? '[]'),
  );

  return [inboxes, outboxes];
}

/**
 * Fetch user's preferred relays from Nostr network
 */
async function getUserPreferredRelays(
  ndk: NDK,
  user: NDKUser,
  fallbacks: readonly string[] = [...get(activeInboxRelays), ...get(activeOutboxRelays)],
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

  if (!relayList) {
    // Fallback to extension relays if available
    const relayMap = await globalThis.nostr?.getRelays?.();
    if (relayMap) {
      Object.entries(relayMap).forEach(
        ([url, relayType]: [string, Record<string, boolean | undefined>]) => {
          const relay = new NDKRelay(
            url,
            NDKRelayAuthPolicies.signIn({ ndk }),
            ndk,
          );
          if (relayType.read) inboxRelays.add(relay);
          if (relayType.write) outboxRelays.add(relay);
        },
      );
    }
  } else {
    // Parse relay list from event
    relayList.tags.forEach((tag: string[]) => {
      const relay = new NDKRelay(tag[1], NDKRelayAuthPolicies.signIn({ ndk }), ndk);
      
      switch (tag[0]) {
        case 'r':
          inboxRelays.add(relay);
          break;
        case 'w':
          outboxRelays.add(relay);
          break;
        default:
          // Default: add to both
          inboxRelays.add(relay);
          outboxRelays.add(relay);
          break;
      }
    });
  }

  return [inboxRelays, outboxRelays];
}

/**
 * Persist login information to localStorage
 */
function persistLogin(user: NDKUser, method: LoginMethod): void {
  const storage = safeLocalStorage();
  if (!storage) return;
  
  storage.setItem(loginStorageKey, user.pubkey);
  storage.setItem(loginMethodStorageKey, method);
}

/**
 * Clear login information from localStorage
 */
function clearLogin(): void {
  const storage = safeLocalStorage();
  if (!storage) return;
  
  storage.removeItem(loginStorageKey);
  storage.removeItem(loginMethodStorageKey);
}

/**
 * Fetch user profile with fallback
 */
async function fetchUserProfile(npub: string): Promise<NostrProfile> {
  try {
    return await getUserMetadata(npub, true);
  } catch (error) {
    console.warn('Failed to fetch user metadata:', error);
    // Fallback profile
    return {
      name: npub.slice(0, 8) + '...' + npub.slice(-4),
      displayName: npub.slice(0, 8) + '...' + npub.slice(-4),
    };
  }
}

/**
 * Fetch and cache user lists in background
 */
async function fetchUserListsAndUpdateCache(userPubkey: string): Promise<void> {
  try {
    console.log('Fetching user lists and updating profile cache for:', userPubkey);
    
    const userLists = await fetchCurrentUserLists();
    console.log(`Found ${userLists.length} user lists`);
    
    // Collect all unique pubkeys
    const allPubkeys = new Set<string>();
    userLists.forEach(list => {
      list.pubkeys.forEach(pubkey => allPubkeys.add(pubkey));
    });
    
    console.log(`Found ${allPubkeys.size} unique pubkeys in user lists`);
    
    // Batch fetch profiles for performance
    const batchSize = 20;
    const pubkeyArray = Array.from(allPubkeys);
    const ndk = get(ndkInstance);
    
    if (!ndk) return;
    
    for (let i = 0; i < pubkeyArray.length; i += batchSize) {
      const batch = pubkeyArray.slice(i, i + batchSize);
      
      try {
        const events = await ndk.fetchEvents({
          kinds: [0],
          authors: batch,
        });
        
        // Cache profiles
        for (const event of events) {
          if (event.content) {
            try {
              const profileData = JSON.parse(event.content);
              const npub = nip19.npubEncode(event.pubkey);
              npubCache.set(npub, profileData);
            } catch (e) {
              console.warn('Failed to parse profile data:', e);
            }
          }
        }
      } catch (error) {
        console.warn('Failed to fetch batch of profiles:', error);
      }
    }
    
    console.log('User lists and profile cache update completed');
  } catch (error) {
    console.warn('Failed to fetch user lists and update cache:', error);
  }
}

/**
 * Common login logic to reduce code duplication
 */
async function performLogin(
  user: NDKUser,
  signer: NDKSigner | null,
  method: LoginMethod,
): Promise<void> {
  const ndk = get(ndkInstance);
  if (!ndk) throw new Error('NDK not initialized');
  
  const npub = user.npub;
  console.log(`Login with ${method} - fetching profile for npub:`, npub);
  
  // Fetch profile
  const profile = await fetchUserProfile(npub);
  console.log(`Login with ${method} - fetched profile:`, profile);
  
  // Handle relays
  const [persistedInboxes, persistedOutboxes] = getPersistedRelays(user);
  persistedInboxes.forEach(relay => ndk.addExplicitRelay(relay));
  
  const [inboxes, outboxes] = await getUserPreferredRelays(ndk, user);
  persistRelays(user, inboxes, outboxes);
  
  // Set NDK state
  ndk.signer = signer || undefined;
  ndk.activeUser = user;
  
  // Create user state
  const userState: UserState = {
    pubkey: user.pubkey,
    npub,
    profile,
    relays: {
      inbox: Array.from(inboxes || persistedInboxes).map((relay) => relay.url),
      outbox: Array.from(outboxes || persistedOutboxes).map((relay) => relay.url),
    },
    loginMethod: method,
    ndkUser: user,
    signer,
    signedIn: true,
  };
  
  console.log(`Login with ${method} - setting userStore with:`, userState);
  userStore.set(userState);
  
  // Update relay stores
  try {
    console.debug(`[userStore.ts] loginWith${method.charAt(0).toUpperCase() + method.slice(1)}: Updating relay stores`);
    await updateActiveRelayStores(ndk, true);
  } catch (error) {
    console.warn(`[userStore.ts] loginWith${method.charAt(0).toUpperCase() + method.slice(1)}: Failed to update relay stores:`, error);
  }
  
  // Background tasks
  fetchUserListsAndUpdateCache(user.pubkey).catch(error => {
    console.warn(`[userStore.ts] loginWith${method.charAt(0).toUpperCase() + method.slice(1)}: Failed to fetch user lists:`, error);
  });
  
  // Cleanup and persist
  clearLogin();
  const storage = safeLocalStorage();
  if (storage) {
    storage.removeItem(LOGOUT_FLAG_KEY);
  }
  persistLogin(user, method);
}

/**
 * Login with NIP-07 browser extension
 */
export async function loginWithExtension(): Promise<void> {
  const ndk = get(ndkInstance);
  if (!ndk) throw new Error('NDK not initialized');
  
  const signer = new NDKNip07Signer();
  const user = await signer.user();
  
  await performLogin(user, signer, 'extension');
}

/**
 * Login with Amber (NIP-46)
 */
export async function loginWithAmber(amberSigner: NDKSigner, user: NDKUser): Promise<void> {
  await performLogin(user, amberSigner, 'amber');
}

/**
 * Login with npub (read-only)
 */
export async function loginWithNpub(pubkeyOrNpub: string): Promise<void> {
  const ndk = get(ndkInstance);
  if (!ndk) throw new Error('NDK not initialized');

  // Decode pubkey
  let hexPubkey: string;
  if (pubkeyOrNpub.startsWith('npub1')) {
    try {
      const decoded = nip19.decode(pubkeyOrNpub);
      if (decoded.type !== 'npub') {
        throw new Error('Invalid npub format');
      }
      hexPubkey = decoded.data;
    } catch (e) {
      console.error('Failed to decode npub:', pubkeyOrNpub, e);
      throw e;
    }
  } else {
    hexPubkey = pubkeyOrNpub;
  }
  
  // Encode npub
  let npub: string;
  try {
    npub = nip19.npubEncode(hexPubkey);
  } catch (e) {
    console.error('Failed to encode npub from hex pubkey:', hexPubkey, e);
    throw e;
  }
  
  console.log('Login with npub - fetching profile for npub:', npub);
  
  const user = ndk.getUser({ npub });
  
  // Update relay stores first
  try {
    console.debug('[userStore.ts] loginWithNpub: Updating relay stores');
    await updateActiveRelayStores(ndk);
  } catch (error) {
    console.warn('[userStore.ts] loginWithNpub: Failed to update relay stores:', error);
  }
  
  // Wait for relay stores to initialize
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Fetch profile
  const profile = await fetchUserProfile(npub);
  
  // Set NDK state (no signer for read-only)
  ndk.signer = undefined;
  ndk.activeUser = user;
  
  // Create user state
  const userState: UserState = {
    pubkey: user.pubkey,
    npub,
    profile,
    relays: { inbox: [], outbox: [] },
    loginMethod: 'npub',
    ndkUser: user,
    signer: null,
    signedIn: true,
  };
  
  console.log('Login with npub - setting userStore with:', userState);
  userStore.set(userState);
  
  // Background tasks
  fetchUserListsAndUpdateCache(user.pubkey).catch(error => {
    console.warn('[userStore.ts] loginWithNpub: Failed to fetch user lists:', error);
  });
  
  // Cleanup and persist
  clearLogin();
  const storage = safeLocalStorage();
  if (storage) {
    storage.removeItem(LOGOUT_FLAG_KEY);
  }
  persistLogin(user, 'npub');
}

/**
 * Logout and clear all user state
 */
export function logoutUser(): void {
  console.log('Logging out user...');
  const currentUser = get(userStore);
  
  // Clear localStorage
  const storage = safeLocalStorage();
  if (storage) {
    if (currentUser.ndkUser) {
      // Clear persisted relays
      storage.removeItem(getRelayStorageKey(currentUser.ndkUser, 'inbox'));
      storage.removeItem(getRelayStorageKey(currentUser.ndkUser, 'outbox'));
    }

    // Clear login data
    clearLogin();

    // Clear any other potential login keys
    const keysToRemove: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && (
        key.includes('login') ||
        key.includes('nostr') ||
        key.includes('user') ||
        key.includes('alexandria') ||
        key === 'pubkey'
      )) {
        keysToRemove.push(key);
      }
    }

    // Clear specific keys
    keysToRemove.push('alexandria/login/pubkey', 'alexandria/login/method');
    keysToRemove.forEach(key => {
      console.log('Removing localStorage key:', key);
      storage.removeItem(key);
    });

    // Clear Amber-specific flags
    storage.removeItem('alexandria/amber/fallback');

    // Set logout flag
    storage.setItem(LOGOUT_FLAG_KEY, 'true');

    console.log('Cleared all login data from localStorage');
  }

  // Clear cache
  relayStorageKeyCache.clear();

  // Reset user store
  userStore.set(initialUserState);

  // Clear NDK state
  const ndk = get(ndkInstance);
  if (ndk) {
    ndk.activeUser = undefined;
    ndk.signer = undefined;
  }

  console.log('Logout complete');
}

/**
 * Reset user store to initial state
 */
export function resetUserStore(): void {
  userStore.set(initialUserState);
  relayStorageKeyCache.clear();
}

/**
 * Get current user state
 */
export function getCurrentUser(): UserState {
  return get(userStore);
}

/**
 * Check if user is signed in
 */
export function isUserSignedIn(): boolean {
  return get(userStore).signedIn;
}
