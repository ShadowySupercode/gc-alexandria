import NDK, {
  NDKNip07Signer,
  NDKRelay,
  NDKRelayAuthPolicies,
  NDKRelaySet,
  NDKUser,
  NDKEvent,
} from "@nostr-dev-kit/ndk";
import { get, writable, type Writable } from "svelte/store";
import {
  loginStorageKey,
} from "./consts.ts";
import {
  buildCompleteRelaySet,
  testRelayConnection,
  deduplicateRelayUrls,
} from "./utils/relay_management.ts";
import { RelayManagementService } from "./services/relay_management_service.ts";
import { userStore } from "./stores/userStore.ts";
import { userPubkey } from "./stores/authStore.Svelte.ts";
import { startNetworkStatusMonitoring, stopNetworkStatusMonitoring } from "./stores/networkStore.ts";
import { WebSocketPool } from "./data_structures/websocket_pool.ts";
import { secondaryRelays, anonymousRelays } from "./consts.ts";

export const ndkInstance: Writable<NDK> = writable();
export const ndkSignedIn = writable(false);
export const activePubkey = writable<string | null>(null);
export const inboxRelays = writable<string[]>([]);
export const outboxRelays = writable<string[]>([]);

// New relay management stores
export const activeInboxRelays = writable<string[]>([]);
export const activeOutboxRelays = writable<string[]>([]);

// Re-export testRelayConnection for components that need it
export { testRelayConnection };

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
  authenticate(relay: NDKRelay): void {
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
          this.handleAuthRequired(relay);
        }
      });

      // Listen for successful authentication
      relay.on("authed", () => {
        console.debug(`[NDK.ts] Successfully authenticated to ${relay.url}`);
      });

      // Listen for authentication failures
      relay.on("auth:failed", (error) => {
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
  private async handleAuthRequired(relay: NDKRelay): Promise<void> {
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
    globalThis.location.hostname === "localhost" ||
    globalThis.location.hostname === "127.0.0.1";
  const isHttp = globalThis.location.protocol === "http:";
  const isHttps = globalThis.location.protocol === "https:";

  console.debug("[NDK.ts] - Is localhost:", isLocalhost);
  console.debug("[NDK.ts] - Protocol:", globalThis.location.protocol);
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
  console.debug("[NDK.ts] - Protocol:", globalThis.location.protocol);
  console.debug("[NDK.ts] - Hostname:", globalThis.location.hostname);
  console.debug("[NDK.ts] - Port:", globalThis.location.port);
  console.debug("[NDK.ts] - User Agent:", navigator.userAgent);

  // Test if secure WebSocket is supported
  try {
    WebSocketPool.instance.acquire("wss://echo.websocket.org").then((ws) => {
      console.debug("[NDK.ts] ✓ Secure WebSocket (wss://) is supported");
      WebSocketPool.instance.release(ws);
    }).catch((_) => {
      console.warn("[NDK.ts] ✗ Secure WebSocket (wss://) may not be supported");
    });
  } catch {
    console.warn("[NDK.ts] ✗ WebSocket test failed");
  }
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
  }, 5000); // 5 second timeout

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





/**
 * Updates relay stores when user state changes
 * @param ndk NDK instance
 */
export async function refreshRelayStores(ndk: NDK): Promise<void> {
  console.debug('[NDK.ts] Refreshing relay stores due to user state change');
  try {
    const user = get(userStore);
    await RelayManagementService.initializeRelayStores(activeInboxRelays, activeOutboxRelays, ndk, user.ndkUser);
    console.debug('[NDK.ts] Relay stores refreshed successfully');
  } catch (error) {
    console.error('[NDK.ts] Failed to refresh relay stores:', error);
  }
}

/**
 * Updates relay stores when network condition changes
 * @param ndk NDK instance
 */
export async function refreshRelayStoresOnNetworkChange(ndk: NDK): Promise<void> {
  console.debug('[NDK.ts] Refreshing relay stores due to network condition change');
  try {
    const user = get(userStore);
    await RelayManagementService.initializeRelayStores(activeInboxRelays, activeOutboxRelays, ndk, user.ndkUser);
    console.debug('[NDK.ts] Relay stores refreshed due to network change');
  } catch (error) {
    console.error('[NDK.ts] Failed to refresh relay stores on network change:', error);
  }
}

/**
 * Starts network monitoring for relay optimization
 * @param ndk NDK instance
 */
export function startNetworkMonitoringForRelays(): void {
  // Use centralized network monitoring instead of separate monitoring
  startNetworkStatusMonitoring();
}

/**
 * Creates NDKRelaySet from relay URLs with proper authentication
 * @param relayUrls Array of relay URLs
 * @param ndk NDK instance
 * @returns NDKRelaySet
 */
function createRelaySetFromUrls(relayUrls: string[], ndk: NDK): NDKRelaySet {
  const relays = relayUrls.map(url => 
    new NDKRelay(url, NDKRelayAuthPolicies.signIn({ ndk }), ndk)
  );
  
  return new NDKRelaySet(new Set(relays), ndk);
}

/**
 * Gets the active relay set as NDKRelaySet for use in queries
 * @param ndk NDK instance
 * @param useInbox Whether to use inbox relays (true) or outbox relays (false)
 * @returns Promise that resolves to NDKRelaySet
 */
export async function getActiveRelaySetAsNDKRelaySet(
  ndk: NDK,
  useInbox: boolean = true
): Promise<NDKRelaySet> {
  const user = get(userStore);
  const relaySet = await buildCompleteRelaySet(ndk, user.ndkUser);
  const urls = useInbox ? relaySet.inboxRelays : relaySet.outboxRelays;
  
  return createRelaySetFromUrls(urls, ndk);
}

/**
 * Initializes relay stores for anonymous users
 * @param ndk NDK instance
 */
async function initializeAnonymousRelayStores(ndk: NDK): Promise<void> {
  try {
    console.debug('[NDK.ts] Initializing relay stores for anonymous user');
    await RelayManagementService.initializeRelayStores(activeInboxRelays, activeOutboxRelays, ndk, null);
    console.debug('[NDK.ts] Relay stores initialized successfully');
  } catch (error) {
    console.error('[NDK.ts] Failed to initialize anonymous relay stores:', error);
  }
}

/**
 * Initializes an instance of NDK with the new relay management system
 * @returns The initialized NDK instance
 */
export function initNdk(): NDK {
  console.debug("[NDK.ts] Initializing NDK with new relay management system");

  const ndk = new NDK({
    autoConnectUserRelays: false, // We'll manage relays manually
    enableOutboxModel: true,
  });

  // Set default relays immediately so components have something to work with
  activeInboxRelays.set(secondaryRelays);
  activeOutboxRelays.set(anonymousRelays);
  console.debug("[NDK.ts] Set default relays immediately:", {
    inboxRelays: secondaryRelays,
    outboxRelays: anonymousRelays
  });

  // Set up custom authentication policy
  ndk.relayAuthDefaultPolicy = NDKRelayAuthPolicies.signIn({ ndk });

  // Connect with better error handling and reduced retry attempts
  let retryCount = 0;
  const maxRetries = 2; // Allow 2 retries for better reliability

  const attemptConnection = async () => {
    try {
      console.debug("[NDK.ts] Attempting NDK connection...");
      await ndk.connect();
      console.debug("[NDK.ts] NDK connected successfully");
      // Initialize relay stores for anonymous users
      await initializeAnonymousRelayStores(ndk);
      // Start network monitoring for relay optimization
      startNetworkMonitoringForRelays();
    } catch (error) {
      console.warn("[NDK.ts] Failed to connect NDK:", error);
      
      // Only retry a limited number of times
      if (retryCount < maxRetries) {
        retryCount++;
        console.debug(`[NDK.ts] Attempting to reconnect (${retryCount}/${maxRetries})...`);
        setTimeout(attemptConnection, 3000); // Increase timeout to 3 seconds
      } else {
        console.warn("[NDK.ts] Max retries reached, continuing with limited functionality");
        // Still try to initialize relay stores even if connection failed
        try {
          await initializeAnonymousRelayStores(ndk);
          startNetworkMonitoringForRelays();
        } catch (storeError) {
          console.warn("[NDK.ts] Failed to initialize relay stores:", storeError);
        }
      }
    }
  };

  // Add a fallback connection attempt with reduced relay set
  const attemptFallbackConnection = async () => {
    try {
      console.debug("[NDK.ts] Attempting fallback connection with minimal relay set...");
      // Use the centralized relay management for fallback relays
      const allWorkingRelays = await RelayManagementService.getWorkingRelays(ndk, null);
      const minimalRelays = allWorkingRelays.slice(0, 2); // Use first 2 relays for fallback
      
      // Try to connect with just these relays by adding them to the pool
      for (const relayUrl of minimalRelays) {
        const relay = new NDKRelay(relayUrl, undefined, ndk);
        ndk.pool?.addRelay(relay);
      }
      
      await ndk.connect();
      console.debug("[NDK.ts] Fallback connection successful");
      
      // Initialize relay stores for anonymous users
      await initializeAnonymousRelayStores(ndk);
      startNetworkMonitoringForRelays();
    } catch (fallbackError) {
      console.warn("[NDK.ts] Fallback connection also failed:", fallbackError);
    }
  };

  attemptConnection();

  return ndk;
}

/**
 * Signs in with a NIP-07 browser extension using the new relay management system
 * @returns The user's profile, if it is available
 * @throws If sign-in fails
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

    const user = ndk.getUser({ pubkey: signerUser.pubkey });
    
    // Update relay stores with the new system
    // await updateActiveRelayStores(ndk); // This line is removed

    ndk.signer = signer;
    ndk.activeUser = user;

    ndkInstance.set(ndk);
    ndkSignedIn.set(true);

    // Refresh relay stores for the logged-in user
    try {
      await refreshRelayStores(ndk);
      console.debug("[NDK.ts] Relay stores refreshed for logged-in user");
    } catch (error) {
      console.warn("[NDK.ts] Failed to refresh relay stores on login:", error);
    }

    return user;
  } catch (e) {
    throw new Error(`Failed to sign in with NIP-07 extension: ${e}`);
  }
}

/**
 * Handles logging out a user.
 * @param user The user to log out.
 */
export async function logout(user: NDKUser): Promise<void> {
  clearLogin();
  clearPersistedRelays(user);
  activePubkey.set(null);
  userPubkey.set(null);
  ndkSignedIn.set(false);
  
  // Stop network monitoring
  stopNetworkStatusMonitoring();
  
  // Re-initialize with anonymous instance
  const newNdk = initNdk();
  ndkInstance.set(newNdk);
  
  // Update relay stores with anonymous relays
  try {
    await initializeAnonymousRelayStores(newNdk);
    console.log("Logout: Relay stores updated with anonymous relays");
  } catch (error) {
    console.warn("Logout: Failed to update relay stores:", error);
  }
}


