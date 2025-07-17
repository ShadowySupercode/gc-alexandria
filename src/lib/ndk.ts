import NDK, {
  NDKNip07Signer,
  NDKRelay,
  NDKRelayAuthPolicies,
  NDKRelaySet,
  NDKUser,
  NDKEvent,
} from '@nostr-dev-kit/ndk';
import { get, writable, type Writable } from 'svelte/store';
import { fallbackRelays, FeedType, loginStorageKey, standardRelays, anonymousRelays } from './consts';
import { feedType } from './stores';
import { userStore } from './stores/userStore';
import { userPubkey } from '$lib/stores/authStore.Svelte';

export const ndkInstance: Writable<NDK> = writable();
export const ndkSignedIn = writable(false);
export const activePubkey = writable<string | null>(null);
export const inboxRelays = writable<string[]>([]);
export const outboxRelays = writable<string[]>([]);

/**
 * Custom authentication policy that handles NIP-42 authentication manually
 * when the default NDK authentication fails
 */
class CustomRelayAuthPolicy {
  private ndk: NDK;
  private challenges: Map<string, string> = new Map();

  constructor(ndk: NDK) {
    this.ndk = ndk;
  }

  /**
   * Handles authentication for a relay
   * @param relay The relay to authenticate with
   * @returns Promise that resolves when authentication is complete
   */
  async authenticate(relay: NDKRelay): Promise<void> {
    if (!this.ndk.signer || !this.ndk.activeUser) {
      console.warn(
        "[NDK.ts] No signer or active user available for relay authentication",
      );
      return;
    }

    try {
      console.debug(`[NDK.ts] Setting up authentication for ${relay.url}`);

      // Listen for AUTH challenges
      relay.on("auth", (challenge: string) => {
        console.debug(
          `[NDK.ts] Received AUTH challenge from ${relay.url}:`,
          challenge,
        );
        this.challenges.set(relay.url, challenge);
        this.handleAuthChallenge(relay, challenge);
      });

      // Listen for auth-required errors (handle via notice events)
      relay.on("notice", (message: string) => {
        if (message.includes("auth-required")) {
          console.debug(`[NDK.ts] Auth required from ${relay.url}:`, message);
          this.handleAuthRequired(relay, message);
        }
      });

      // Listen for successful authentication
      relay.on("authed", () => {
        console.debug(`[NDK.ts] Successfully authenticated to ${relay.url}`);
      });

      // Listen for authentication failures
      relay.on("auth:failed", (error: any) => {
        console.error(
          `[NDK.ts] Authentication failed for ${relay.url}:`,
          error,
        );
      });
    } catch (error) {
      console.error(
        `[NDK.ts] Error setting up authentication for ${relay.url}:`,
        error,
      );
    }
  }

  /**
   * Handles AUTH challenge from relay
   */
  private async handleAuthChallenge(
    relay: NDKRelay,
    challenge: string,
  ): Promise<void> {
    try {
      if (!this.ndk.signer || !this.ndk.activeUser) {
        console.warn("[NDK.ts] No signer available for AUTH challenge");
        return;
      }

      // Create NIP-42 authentication event
      const authEvent = {
        kind: 22242,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ["relay", relay.url],
          ["challenge", challenge],
        ],
        content: "",
        pubkey: this.ndk.activeUser.pubkey,
      };

      // Create and sign the authentication event using NDKEvent
      const authNDKEvent = new NDKEvent(this.ndk, authEvent);
      await authNDKEvent.sign();

      // Send AUTH message to relay using the relay's publish method
      await relay.publish(authNDKEvent);
      console.debug(`[NDK.ts] Sent AUTH to ${relay.url}`);
    } catch (error) {
      console.error(
        `[NDK.ts] Error handling AUTH challenge for ${relay.url}:`,
        error,
      );
    }
  }

  /**
   * Handles auth-required error from relay
   */
  private async handleAuthRequired(
    relay: NDKRelay,
    message: string,
  ): Promise<void> {
    const challenge = this.challenges.get(relay.url);
    if (challenge) {
      await this.handleAuthChallenge(relay, challenge);
    } else {
      console.warn(
        `[NDK.ts] Auth required from ${relay.url} but no challenge available`,
      );
    }
  }
}

/**
 * Checks if the current environment might cause WebSocket protocol downgrade
 */
export function checkEnvironmentForWebSocketDowngrade(): void {
  console.debug("[NDK.ts] Environment Check for WebSocket Protocol:");

  const isLocalhost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";
  const isHttp = window.location.protocol === "http:";
  const isHttps = window.location.protocol === "https:";

  console.debug("[NDK.ts] - Is localhost:", isLocalhost);
  console.debug("[NDK.ts] - Protocol:", window.location.protocol);
  console.debug("[NDK.ts] - Is HTTP:", isHttp);
  console.debug("[NDK.ts] - Is HTTPS:", isHttps);

  if (isLocalhost && isHttp) {
    console.warn(
      "[NDK.ts] ⚠️ Running on localhost with HTTP - WebSocket downgrade to ws:// is expected",
    );
    console.warn("[NDK.ts] This is normal for development environments");
  } else if (isHttp) {
    console.error(
      "[NDK.ts] ❌ Running on HTTP - WebSocket connections will be insecure",
    );
    console.error("[NDK.ts] Consider using HTTPS in production");
  } else if (isHttps) {
    console.debug(
      "[NDK.ts] ✓ Running on HTTPS - Secure WebSocket connections should work",
    );
  }
}

/**
 * Checks WebSocket protocol support and logs diagnostic information
 */
export function checkWebSocketSupport(): void {
  console.debug("[NDK.ts] WebSocket Support Diagnostics:");
  console.debug("[NDK.ts] - Protocol:", window.location.protocol);
  console.debug("[NDK.ts] - Hostname:", window.location.hostname);
  console.debug("[NDK.ts] - Port:", window.location.port);
  console.debug("[NDK.ts] - User Agent:", navigator.userAgent);

  // Test if secure WebSocket is supported
  try {
    const testWs = new WebSocket("wss://echo.websocket.org");
    testWs.onopen = () => {
      console.debug("[NDK.ts] ✓ Secure WebSocket (wss://) is supported");
      testWs.close();
    };
    testWs.onerror = () => {
      console.warn("[NDK.ts] ✗ Secure WebSocket (wss://) may not be supported");
    };
  } catch (error) {
    console.warn("[NDK.ts] ✗ WebSocket test failed:", error);
  }
}

/**
 * Tests connection to a relay and returns connection status
 * @param relayUrl The relay URL to test
 * @param ndk The NDK instance
 * @returns Promise that resolves to connection status
 */
export async function testRelayConnection(
  relayUrl: string,
  ndk: NDK,
): Promise<{
  connected: boolean;
  requiresAuth: boolean;
  error?: string;
  actualUrl?: string;
}> {
  return new Promise((resolve) => {
    console.debug(`[NDK.ts] Testing connection to: ${relayUrl}`);

    // Ensure the URL is using wss:// protocol
    const secureUrl = ensureSecureWebSocket(relayUrl);

    const relay = new NDKRelay(secureUrl, undefined, new NDK());
    let authRequired = false;
    let connected = false;
    let error: string | undefined;
    let actualUrl: string | undefined;

    const timeout = setTimeout(() => {
      relay.disconnect();
      resolve({
        connected: false,
        requiresAuth: authRequired,
        error: "Connection timeout",
        actualUrl,
      });
    }, 5000);

    relay.on("connect", () => {
      console.debug(`[NDK.ts] Connected to ${secureUrl}`);
      connected = true;
      actualUrl = secureUrl;
      clearTimeout(timeout);
      relay.disconnect();
      resolve({
        connected: true,
        requiresAuth: authRequired,
        error,
        actualUrl,
      });
    });

    relay.on("notice", (message: string) => {
      if (message.includes("auth-required")) {
        authRequired = true;
        console.debug(`[NDK.ts] ${secureUrl} requires authentication`);
      }
    });

    relay.on("disconnect", () => {
      if (!connected) {
        error = "Connection failed";
        console.error(`[NDK.ts] Failed to connect to ${secureUrl}`);
        clearTimeout(timeout);
        resolve({
          connected: false,
          requiresAuth: authRequired,
          error,
          actualUrl,
        });
      }
    });

    // Log the actual WebSocket URL being used
    console.debug(`[NDK.ts] Attempting connection to: ${secureUrl}`);
    relay.connect();
  });
}

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
function getRelayStorageKey(user: NDKUser, type: "inbox" | "outbox"): string {
  return `${loginStorageKey}/${user.pubkey}/${type}`;
}

/**
 * Stores the user's relay lists in local storage.
 * @param user The user for whom to store the relay lists.
 * @param inboxes The user's inbox relays.
 * @param outboxes The user's outbox relays.
 */
function persistRelays(
  user: NDKUser,
  inboxes: Set<NDKRelay>,
  outboxes: Set<NDKRelay>,
): void {
  localStorage.setItem(
    getRelayStorageKey(user, "inbox"),
    JSON.stringify(Array.from(inboxes).map((relay) => relay.url)),
  );
  localStorage.setItem(
    getRelayStorageKey(user, "outbox"),
    JSON.stringify(Array.from(outboxes).map((relay) => relay.url)),
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
    JSON.parse(localStorage.getItem(getRelayStorageKey(user, "inbox")) ?? "[]"),
  );
  const outboxes = new Set<string>(
    JSON.parse(
      localStorage.getItem(getRelayStorageKey(user, "outbox")) ?? "[]",
    ),
  );

  return [inboxes, outboxes];
}

export function clearPersistedRelays(user: NDKUser): void {
  localStorage.removeItem(getRelayStorageKey(user, "inbox"));
  localStorage.removeItem(getRelayStorageKey(user, "outbox"));
}

/**
 * Ensures a relay URL uses secure WebSocket protocol
 * @param url The relay URL to secure
 * @returns The URL with wss:// protocol
 */
function ensureSecureWebSocket(url: string): string {
  // Replace ws:// with wss:// if present
  const secureUrl = url.replace(/^ws:\/\//, "wss://");

  if (secureUrl !== url) {
    console.warn(
      `[NDK.ts] Protocol downgrade detected: ${url} -> ${secureUrl}`,
    );
  }

  return secureUrl;
}

/**
 * Creates a relay with proper authentication handling
 */
function createRelayWithAuth(url: string, ndk: NDK): NDKRelay {
  console.debug(`[NDK.ts] Creating relay with URL: ${url}`);

  // Ensure the URL is using wss:// protocol
  const secureUrl = ensureSecureWebSocket(url);

  // Add connection timeout and error handling
  const relay = new NDKRelay(
    secureUrl,
    NDKRelayAuthPolicies.signIn({ ndk }),
    ndk,
  );

  // Set up connection timeout
  const connectionTimeout = setTimeout(() => {
    console.warn(`[NDK.ts] Connection timeout for ${secureUrl}`);
    relay.disconnect();
  }, 10000); // 10 second timeout

  // Set up custom authentication handling only if user is signed in
  if (ndk.signer && ndk.activeUser) {
    const authPolicy = new CustomRelayAuthPolicy(ndk);
    relay.on("connect", () => {
      console.debug(`[NDK.ts] Relay connected: ${secureUrl}`);
      clearTimeout(connectionTimeout);
      authPolicy.authenticate(relay);
    });
  } else {
    relay.on("connect", () => {
      console.debug(`[NDK.ts] Relay connected: ${secureUrl}`);
      clearTimeout(connectionTimeout);
    });
  }

  // Add error handling
  relay.on("disconnect", () => {
    console.debug(`[NDK.ts] Relay disconnected: ${secureUrl}`);
    clearTimeout(connectionTimeout);
  });

  return relay;
}

export function getActiveRelays(ndk: NDK): NDKRelaySet {
  const user = get(userStore);
  
  // Filter out problematic relays that are known to cause connection issues
  const filterProblematicRelays = (relays: string[]) => {
    return relays.filter(relay => {
      // Filter out gitcitadel.nostr1.com which is causing connection issues
      if (relay.includes('gitcitadel.nostr1.com')) {
        console.warn(`[NDK.ts] Filtering out problematic relay: ${relay}`);
        return false;
      }
      return true;
    });
  };
  
  return get(feedType) === FeedType.UserRelays && user.signedIn
    ? new NDKRelaySet(
        new Set(filterProblematicRelays(user.relays.inbox).map(relay => new NDKRelay(
          relay,
          NDKRelayAuthPolicies.signIn({ ndk }),
          ndk,
        ))),
        ndk
      )
    : new NDKRelaySet(
        new Set(filterProblematicRelays(standardRelays).map(relay => new NDKRelay(
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
  const [startingInboxes, _] =
    startingPubkey != null
      ? getPersistedRelays(new NDKUser({ pubkey: startingPubkey }))
      : [null, null];

  // Ensure all relay URLs use secure WebSocket protocol
  const secureRelayUrls = (
    startingInboxes != null
      ? Array.from(startingInboxes.values())
      : anonymousRelays
  ).map(ensureSecureWebSocket);

  console.debug("[NDK.ts] Initializing NDK with relay URLs:", secureRelayUrls);

  const ndk = new NDK({
    autoConnectUserRelays: true,
    enableOutboxModel: true,
    explicitRelayUrls: secureRelayUrls,
  });

  // Set up custom authentication policy
  ndk.relayAuthDefaultPolicy = NDKRelayAuthPolicies.signIn({ ndk });
  
  // Connect with better error handling
  ndk.connect()
    .then(() => {
      console.debug("[NDK.ts] NDK connected successfully");
    })
    .catch((error) => {
      console.error("[NDK.ts] Failed to connect NDK:", error);
      // Try to reconnect after a delay
      setTimeout(() => {
        console.debug("[NDK.ts] Attempting to reconnect...");
        ndk.connect().catch((retryError) => {
          console.error("[NDK.ts] Reconnection failed:", retryError);
        });
      }, 5000);
    });
    
  return ndk;
}

/**
 * Signs in with a NIP-07 browser extension, and determines the user's preferred inbox and outbox
 * relays.
 * @returns The user's profile, if it is available.
 * @throws If sign-in fails.  This may because there is no accessible NIP-07 extension, or because
 * NDK is unable to fetch the user's profile or relay lists.
 */
export async function loginWithExtension(
  pubkey?: string,
): Promise<NDKUser | null> {
  try {
    const ndk = get(ndkInstance);
    const signer = new NDKNip07Signer();
    const signerUser = await signer.user();

    // TODO: Handle changing pubkeys.
    if (pubkey && signerUser.pubkey !== pubkey) {
      console.debug("[NDK.ts] Switching pubkeys from last login.");
    }

    activePubkey.set(signerUser.pubkey);
    userPubkey.set(signerUser.pubkey);

    const [persistedInboxes, persistedOutboxes] =
      getPersistedRelays(signerUser);
    for (const relay of persistedInboxes) {
      ndk.addExplicitRelay(relay);
    }

    const user = ndk.getUser({ pubkey: signerUser.pubkey });
    const [inboxes, outboxes] = await getUserPreferredRelays(ndk, user);

    inboxRelays.set(
      Array.from(inboxes ?? persistedInboxes).map((relay) => relay.url),
    );
    outboxRelays.set(
      Array.from(outboxes ?? persistedOutboxes).map((relay) => relay.url),
    );

    persistRelays(signerUser, inboxes, outboxes);

    ndk.signer = signer;
    ndk.activeUser = user;

    ndkInstance.set(ndk);
    ndkSignedIn.set(true);

    return user;
  } catch (e) {
    throw new Error(`Failed to sign in with NIP-07 extension: ${e}`);
  }
}

/**
 * Handles logging out a user.
 * @param user The user to log out.
 */
export function logout(user: NDKUser): void {
  clearLogin();
  clearPersistedRelays(user);
  activePubkey.set(null);
  userPubkey.set(null);
  ndkSignedIn.set(false);
  ndkInstance.set(initNdk()); // Re-initialize with anonymous instance
}

/**
 * Fetches the user's NIP-65 relay list, if one can be found, and returns the inbox and outbox
 * relay sets.
 * @returns A tuple of relay sets of the form `[inboxRelays, outboxRelays]`.
 */
export async function getUserPreferredRelays(
  ndk: NDK,
  user: NDKUser,
  fallbacks: readonly string[] = fallbackRelays,
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

  // Filter out problematic relays
  const filterProblematicRelay = (url: string): boolean => {
    if (url.includes('gitcitadel.nostr1.com')) {
      console.warn(`[NDK.ts] Filtering out problematic relay from user preferences: ${url}`);
      return false;
    }
    return true;
  };

  if (relayList == null) {
    const relayMap = await window.nostr?.getRelays?.();
    Object.entries(relayMap ?? {}).forEach(([url, relayType]) => {
      if (filterProblematicRelay(url)) {
        const relay = createRelayWithAuth(url, ndk);
        if (relayType.read) inboxRelays.add(relay);
        if (relayType.write) outboxRelays.add(relay);
      }
    });
  } else {
    relayList.tags.forEach((tag) => {
      if (filterProblematicRelay(tag[1])) {
        switch (tag[0]) {
          case "r":
            inboxRelays.add(createRelayWithAuth(tag[1], ndk));
            break;
          case "w":
            outboxRelays.add(createRelayWithAuth(tag[1], ndk));
            break;
          default:
            inboxRelays.add(createRelayWithAuth(tag[1], ndk));
            outboxRelays.add(createRelayWithAuth(tag[1], ndk));
            break;
        }
      }
    });
  }

  return [inboxRelays, outboxRelays];
}
