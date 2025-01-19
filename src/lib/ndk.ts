import NDK, { NDKNip07Signer, NDKRelay, NDKUser, type NDKUserProfile } from '@nostr-dev-kit/ndk';
import { get, writable, type Writable } from 'svelte/store';
import { loginStorageKey, standardRelays } from './consts';

export const ndkInstance: Writable<NDK> = writable();

export const ndkSignedIn: Writable<boolean> = writable(false);

export const inboxRelays: Writable<string[]> = writable([]);
export const outboxRelays: Writable<string[]> = writable([]);

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
 * Initializes an instance of NDK, and connects it to the standard relays.
 * @returns The initialized NDK instance.
 */
export function initNdk(): NDK {
  const ndk = new NDK({
    autoConnectUserRelays: true,
    enableOutboxModel: true,
    explicitRelayUrls: standardRelays,
  });
  ndk.connect().then(() => console.debug("ndk connected"));
  return ndk;
}

/**
 * Signs in with a NIP-07 browser extension, and determines the user's preferred inbox and outbox
 * relays.
 * @returns The user's profile, if it is available.
 * @throws If sign-in fails.  This may because there is no accessible NIP-07 extension, or because
 * NDK is unable to fetch the user's profile or relay lists.
 */
export async function loginWithExtension(pubkey?: string): Promise<NDKUser | null> {
  try {
    const ndk = get(ndkInstance);
    const signer = new NDKNip07Signer();
    const signerUser = await signer.user();

    if (pubkey && signerUser.pubkey !== pubkey) {
      throw new Error(`The NIP-07 signer is not using the given pubkey: ${signerUser.pubkey}`);
    }

    const user = ndk.getUser({ pubkey: signerUser.pubkey });
    const [inboxes, outboxes] = await getUserPreferredRelays(ndk, user);

    inboxRelays.set(Array.from(inboxes).map(relay => relay.url));
    outboxRelays.set(Array.from(outboxes).map(relay => relay.url));

    ndk.signer = signer;
    ndk.activeUser = user;

    ndkSignedIn.set(true);
    ndkInstance.set(ndk);

    return user;
  } catch (e) {
    throw new Error(`Failed to sign in with NIP-07 extension: ${e}`);
  }
}

/**
 * Fetches the user's NIP-65 relay list, if one can be found, and returns the inbox and outbox
 * relay sets.
 * @returns A tuple of relay sets of the form `[inboxRelays, outboxRelays]`.
 */
async function getUserPreferredRelays(
  ndk: NDK,
  user: NDKUser
): Promise<[Set<NDKRelay>, Set<NDKRelay>]> {
  const relayLists = await ndk.fetchEvents({
    kinds: [10002],
    authors: [user.pubkey],
  });

  if (relayLists.size === 0) {
    throw new Error(`No relay lists found for the given user: ${user.pubkey}`);
  }

  const inboxRelays = new Set<NDKRelay>();
  const outboxRelays = new Set<NDKRelay>();

  relayLists.forEach(relayList => {
    relayList.tags.forEach(tag => {
      switch (tag[0]) {
        case 'r':
          inboxRelays.add(new NDKRelay(tag[1]));
          break;
        case 'w':
          outboxRelays.add(new NDKRelay(tag[1]));
          break;
        default:
          inboxRelays.add(new NDKRelay(tag[1]));
          outboxRelays.add(new NDKRelay(tag[1]));
          break;
      }
    });
  });

  return [inboxRelays, outboxRelays];
}
