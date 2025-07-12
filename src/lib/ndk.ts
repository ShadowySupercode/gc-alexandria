import NDK, { NDKRelay, NDKRelayAuthPolicies, NDKRelaySet, NDKUser } from '@nostr-dev-kit/ndk';
import { get, writable, type Writable } from 'svelte/store';
import { fallbackRelays, FeedType, loginStorageKey, standardRelays } from './consts';
import { feedType } from './stores';
import { userStore } from './stores/userStore';

export const ndkInstance: Writable<NDK> = writable();

/**
 * Gets the user's pubkey from local storage, if it exists.
 * @returns The user's pubkey, or null if there is no logged-in user.
 * @remarks Local storage is used in place of cookies to persist the user's login across browser
 * sessions.
 */
export function getPersistedLogin(): string | null {
  const pubkey = localStorage.getItem(loginStorageKey);
  return pubkey;
}

/**
 * Writes the user's pubkey to local storage.
 * @param user The user to persist.
 * @remarks Use this function when the user logs in.  Currently, only one pubkey is stored at a
 * time.
 */
export function persistLogin(user: NDKUser): void {
  localStorage.setItem(loginStorageKey, user.pubkey);
}

/**
 * Clears the user's pubkey from local storage.
 * @remarks Use this function when the user logs out.
 */
export function clearLogin(): void {
  localStorage.removeItem(loginStorageKey);
}

/**
 * Constructs a key use to designate a user's relay lists in local storage.
 * @param user The user for whom to construct the key.
 * @param type The type of relay list to designate.
 * @returns The constructed key.
 */
function getRelayStorageKey(user: NDKUser, type: 'inbox' | 'outbox'): string {
  return `${loginStorageKey}/${user.pubkey}/${type}`;
}

/**
 * Stores the user's relay lists in local storage.
 * @param user The user for whom to store the relay lists.
 * @param inboxes The user's inbox relays.
 * @param outboxes The user's outbox relays.
 */
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

/**
 * Retrieves the user's relay lists from local storage.
 * @param user The user for whom to retrieve the relay lists.
 * @returns A tuple of relay sets of the form `[inboxRelays, outboxRelays]`.  Either set may be
 * empty if no relay lists were stored for the user.
 */
function getPersistedRelays(user: NDKUser): [Set<string>, Set<string>] {
  const inboxes = new Set<string>(
    JSON.parse(localStorage.getItem(getRelayStorageKey(user, 'inbox')) ?? '[]')
  );
  const outboxes = new Set<string>(
    JSON.parse(localStorage.getItem(getRelayStorageKey(user, 'outbox')) ?? '[]')
  );

  return [inboxes, outboxes];
}

export function clearPersistedRelays(user: NDKUser): void {
  localStorage.removeItem(getRelayStorageKey(user, 'inbox'));
  localStorage.removeItem(getRelayStorageKey(user, 'outbox')); 
}

export function getActiveRelays(ndk: NDK): NDKRelaySet {
  const user = get(userStore);
  return get(feedType) === FeedType.UserRelays && user.signedIn
    ? new NDKRelaySet(
        new Set(user.relays.inbox.map(relay => new NDKRelay(
          relay,
          NDKRelayAuthPolicies.signIn({ ndk }),
          ndk,
        ))),
        ndk
      )
    : new NDKRelaySet(
        new Set(standardRelays.map(relay => new NDKRelay(
          relay,
          NDKRelayAuthPolicies.signIn({ ndk }),
          ndk,
        ))),
        ndk
      );
}

/**
 * Initializes an instance of NDK, and connects it to the logged-in user's preferred relay set
 * (if available), or to Alexandria's standard relay set.
 * @returns The initialized NDK instance.
 */
export function initNdk(): NDK {
  const startingPubkey = getPersistedLogin();
  const [startingInboxes, _] = startingPubkey != null
    ? getPersistedRelays(new NDKUser({ pubkey: startingPubkey }))
    : [null, null];

  const ndk = new NDK({
    autoConnectUserRelays: true,
    enableOutboxModel: true,
    explicitRelayUrls: startingInboxes != null
      ? Array.from(startingInboxes.values())
      : standardRelays,
  });

  // TODO: Should we prompt the user to confirm authentication?
  ndk.relayAuthDefaultPolicy = NDKRelayAuthPolicies.signIn({ ndk });
  ndk.connect().then(() => console.debug("ndk connected"));
  return ndk;
}

/**
 * Fetches the user's NIP-65 relay list, if one can be found, and returns the inbox and outbox
 * relay sets.
 * @returns A tuple of relay sets of the form `[inboxRelays, outboxRelays]`.
 */
export async function getUserPreferredRelays(
  ndk: NDK,
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
    Object.entries(relayMap ?? {}).forEach(([url, relayType]) => {
      const relay = new NDKRelay(url, NDKRelayAuthPolicies.signIn({ ndk }), ndk);
      if (relayType.read) inboxRelays.add(relay);
      if (relayType.write) outboxRelays.add(relay);
    });
  } else {
    relayList.tags.forEach(tag => {
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
