import NDK, {
  NDKNip07Signer,
  NDKRelay,
  NDKRelayAuthPolicies,
  NDKRelaySet,
  NDKUser,
  NDKEvent,
} from "@nostr-dev-kit/ndk";
import { writable, get, type Writable } from "svelte/store";
import {
  loginStorageKey,
  anonymousRelays,
} from "./consts.ts";
import {
  buildCompleteRelaySet,
  testRelayConnection,
  deduplicateRelayUrls,
} from "./utils/relay_management.ts";

// Re-export testRelayConnection for components that need it
export { testRelayConnection };
import { userStore } from "./stores/userStore.ts";
import { userPubkey } from "./stores/authStore.Svelte.ts";
import { startNetworkStatusMonitoring, stopNetworkStatusMonitoring } from "./stores/networkStore.ts";
import { WebSocketPool } from "./data_structures/websocket_pool.ts";

export const ndkInstance: Writable<NDK> = writable();
export const ndkSignedIn = writable(false);
export const activePubkey = writable<string | null>(null);
export const inboxRelays = writable<string[]>([]);
export const outboxRelays = writable<string[]>([]);

// New relay management stores
export const activeInboxRelays = writable<string[]>([]);
export const activeOutboxRelays = writable<string[]>([]);

// AI-NOTE: 2025-01-08 - Persistent relay storage to avoid recalculation
let persistentRelaySet: { inboxRelays: string[]; outboxRelays: string[] } | null = null;
let relaySetLastUpdated: number = 0;
const RELAY_SET_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const RELAY_SET_STORAGE_KEY = 'alexandria/relay_set_cache';

/**
 * Load persistent relay set from localStorage
 */
function loadPersistentRelaySet(): { relaySet: { inboxRelays: string[]; outboxRelays: string[] } | null; lastUpdated: number } {
  // Only load from localStorage on client-side
  if (typeof window === 'undefined') return { relaySet: null, lastUpdated: 0 };
  
  try {
    const stored = localStorage.getItem(RELAY_SET_STORAGE_KEY);
    if (!stored) return { relaySet: null, lastUpdated: 0 };
    
    const data = JSON.parse(stored);
    const now = Date.now();
    
    // Check if cache is expired
    if (now - data.timestamp > RELAY_SET_CACHE_DURATION) {
      localStorage.removeItem(RELAY_SET_STORAGE_KEY);
      return { relaySet: null, lastUpdated: 0 };
    }
    
    return { relaySet: data.relaySet, lastUpdated: data.timestamp };
  } catch (error) {
    console.warn('[NDK.ts] Failed to load persistent relay set:', error);
    localStorage.removeItem(RELAY_SET_STORAGE_KEY);
    return { relaySet: null, lastUpdated: 0 };
  }
}

/**
 * Save persistent relay set to localStorage
 */
function savePersistentRelaySet(relaySet: { inboxRelays: string[]; outboxRelays: string[] }): void {
  // Only save to localStorage on client-side
  if (typeof window === 'undefined') return;
  
  try {
    const data = {
      relaySet,
      timestamp: Date.now()
    };
    localStorage.setItem(RELAY_SET_STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.warn('[NDK.ts] Failed to save persistent relay set:', error);
  }
}

/**
 * Clear persistent relay set from localStorage
 */
function clearPersistentRelaySet(): void {
  // Only clear from localStorage on client-side
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.removeItem(RELAY_SET_STORAGE_KEY);
  } catch (error) {
    console.warn('[NDK.ts] Failed to clear persistent relay set:', error);
  }
}

// AI-NOTE: userStore subscription moved to initNdk function to prevent initialization errors
// The subscription will be set up after userStore is properly initialized

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
  // Only access localStorage on client-side
  if (typeof window === 'undefined') return null;
  
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
  // Only access localStorage on client-side
  if (typeof window === 'undefined') return;
  
  localStorage.setItem(loginStorageKey, user.pubkey);
}

/**
 * Clears the user's pubkey from local storage.
 * @remarks Use this function when the user logs out.
 */
export function clearLogin(): void {
  // Only access localStorage on client-side
  if (typeof window === 'undefined') return;
  
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
  // Only access localStorage on client-side
  if (typeof window === 'undefined') return;
  
  localStorage.removeItem(getRelayStorageKey(user, "inbox"));
  localStorage.removeItem(getRelayStorageKey(user, "outbox"));
}

/**
 * Ensures a relay URL uses secure WebSocket protocol
 * @param url The relay URL to secure
 * @returns The URL with appropriate protocol (ws:// for localhost, wss:// for remote)
 */
function ensureSecureWebSocket(url: string): string {
  // For localhost, always use ws:// (never wss://)
  if (url.includes('localhost') || url.includes('127.0.0.1')) {
    // Convert any wss://localhost to ws://localhost
    return url.replace(/^wss:\/\//, "ws://");
  }
  
  // Replace ws:// with wss:// for remote relays
  const secureUrl = url.replace(/^ws:\/\//, "wss://");

  if (secureUrl !== url) {
    console.warn(
      `[NDK.ts] Protocol upgrade for remote relay: ${url} -> ${secureUrl}`,
    );
  }

  return secureUrl;
}

/**
 * Creates a relay with proper authentication handling
 */
function createRelayWithAuth(url: string, ndk: NDK): NDKRelay {
  try {
    // Reduce verbosity in development - only log relay creation if debug mode is enabled
    if (process.env.NODE_ENV === 'development' && process.env.DEBUG_RELAYS) {
      console.debug(`[NDK.ts] Creating relay with URL: ${url}`);
    }

    // Ensure the URL is using appropriate protocol
    const secureUrl = ensureSecureWebSocket(url);

    // Add connection timeout and error handling
    const relay = new NDKRelay(
      secureUrl,
      NDKRelayAuthPolicies.signIn({ ndk }),
      ndk,
    );

    // Set up connection timeout
    const connectionTimeout = setTimeout(() => {
      try {
        // Only log connection timeouts if debug mode is enabled
        if (process.env.NODE_ENV === 'development' && process.env.DEBUG_RELAYS) {
          console.debug(`[NDK.ts] Connection timeout for ${secureUrl}`);
        }
        relay.disconnect();
      } catch {
        // Silently ignore disconnect errors
      }
    }, 5000); // 5 second timeout

    // Set up custom authentication handling only if user is signed in
    if (ndk.signer && ndk.activeUser) {
      const authPolicy = new CustomRelayAuthPolicy(ndk);
      relay.on("connect", () => {
        try {
          // Only log successful connections if debug mode is enabled
          if (process.env.NODE_ENV === 'development' && process.env.DEBUG_RELAYS) {
            console.debug(`[NDK.ts] Relay connected: ${secureUrl}`);
          }
          clearTimeout(connectionTimeout);
          authPolicy.authenticate(relay);
        } catch {
          // Silently handle connect handler errors
        }
      });
    } else {
      relay.on("connect", () => {
        try {
          // Only log successful connections if debug mode is enabled
          if (process.env.NODE_ENV === 'development' && process.env.DEBUG_RELAYS) {
            console.debug(`[NDK.ts] Relay connected: ${secureUrl}`);
          }
          clearTimeout(connectionTimeout);
        } catch {
          // Silently handle connect handler errors
        }
      });
    }

    // Add error handling
    relay.on("disconnect", () => {
      try {
        console.debug(`[NDK.ts] Relay disconnected: ${secureUrl}`);
        clearTimeout(connectionTimeout);
      } catch {
        // Silently handle disconnect handler errors
      }
    });

    return relay;
  } catch (error) {
    // If relay creation fails, try to use an anonymous relay as fallback
    console.debug(`[NDK.ts] Failed to create relay for ${url}, trying anonymous relay fallback`);
    
    // Find an anonymous relay that's not the same as the failed URL
    const fallbackUrl = anonymousRelays.find(relay => relay !== url) || anonymousRelays[0];
    
    if (fallbackUrl) {
      console.debug(`[NDK.ts] Using anonymous relay as fallback: ${fallbackUrl}`);
      try {
        const fallbackRelay = new NDKRelay(fallbackUrl, NDKRelayAuthPolicies.signIn({ ndk }), ndk);
        return fallbackRelay;
      } catch (fallbackError) {
        console.debug(`[NDK.ts] Fallback relay creation also failed: ${fallbackError}`);
      }
    }
    
    // If all else fails, create a minimal relay that will fail gracefully
    console.debug(`[NDK.ts] All fallback attempts failed, creating minimal relay for ${url}`);
    const minimalRelay = new NDKRelay(url, undefined, ndk);
    return minimalRelay;
  }
}





/**
 * Gets the active relay set for the current user
 * @param ndk NDK instance
 * @returns Promise that resolves to object with inbox and outbox relay arrays
 */
export async function getActiveRelaySet(ndk: NDK): Promise<{ inboxRelays: string[]; outboxRelays: string[] }> {
  const user = get(userStore);
  console.debug('[NDK.ts] getActiveRelaySet: User state:', { signedIn: user.signedIn, hasNdkUser: !!user.ndkUser, pubkey: user.pubkey });
  
  if (user.signedIn && user.ndkUser) {
    console.debug('[NDK.ts] getActiveRelaySet: Building relay set for authenticated user:', user.ndkUser.pubkey);
    return await buildCompleteRelaySet(ndk, user.ndkUser);
  } else {
    console.debug('[NDK.ts] getActiveRelaySet: Building relay set for anonymous user');
    return await buildCompleteRelaySet(ndk, null);
  }
}

/**
 * Updates the active relay stores and NDK pool with new relay URLs
 * @param ndk NDK instance
 * @param forceUpdate Force update even if cached (default: false)
 */
export async function updateActiveRelayStores(ndk: NDK, forceUpdate: boolean = false): Promise<void> {
  try {
    // AI-NOTE: 2025-01-08 - Use persistent relay set to avoid recalculation
    const now = Date.now();
    const cacheExpired = now - relaySetLastUpdated > RELAY_SET_CACHE_DURATION;
    
    // Load from persistent storage if not already loaded
    if (!persistentRelaySet) {
      const loaded = loadPersistentRelaySet();
      persistentRelaySet = loaded.relaySet;
      relaySetLastUpdated = loaded.lastUpdated;
    }
    
    if (!forceUpdate && persistentRelaySet && !cacheExpired) {
      console.debug('[NDK.ts] updateActiveRelayStores: Using cached relay set');
      activeInboxRelays.set(persistentRelaySet.inboxRelays);
      activeOutboxRelays.set(persistentRelaySet.outboxRelays);
      return;
    }
    
    console.debug('[NDK.ts] updateActiveRelayStores: Starting relay store update');
    
    // Get the active relay set from the relay management system
    const relaySet = await getActiveRelaySet(ndk);
    console.debug('[NDK.ts] updateActiveRelayStores: Got relay set:', relaySet);
    
    // Cache the relay set
    persistentRelaySet = relaySet;
    relaySetLastUpdated = now;
    savePersistentRelaySet(relaySet); // Save to persistent storage
    
    // Update the stores with the new relay configuration
    activeInboxRelays.set(relaySet.inboxRelays);
    activeOutboxRelays.set(relaySet.outboxRelays);
    console.debug('[NDK.ts] updateActiveRelayStores: Updated stores with inbox:', relaySet.inboxRelays.length, 'outbox:', relaySet.outboxRelays.length);
    
    // Add relays to NDK pool (deduplicated)
    const allRelayUrls = deduplicateRelayUrls([...relaySet.inboxRelays, ...relaySet.outboxRelays]);
    // Reduce verbosity in development - only log relay addition if debug mode is enabled
    if (process.env.NODE_ENV === 'development' && process.env.DEBUG_RELAYS) {
      console.debug('[NDK.ts] updateActiveRelayStores: Adding', allRelayUrls.length, 'relays to NDK pool');
    }
    
    for (const url of allRelayUrls) {
      try {
        const relay = createRelayWithAuth(url, ndk);
        ndk.pool?.addRelay(relay);
      } catch (error) {
        console.debug('[NDK.ts] updateActiveRelayStores: Failed to add relay', url, ':', error);
      }
    }
    
    console.debug('[NDK.ts] updateActiveRelayStores: Relay store update completed');
  } catch (error) {
    console.warn('[NDK.ts] updateActiveRelayStores: Error updating relay stores:', error);
  }
}

/**
 * Logs the current relay configuration to console
 */
export function logCurrentRelayConfiguration(): void {
  const inboxRelays = get(activeInboxRelays);
  const outboxRelays = get(activeOutboxRelays);
  
  console.log('🔌 Current Relay Configuration:');
  console.log('📥 Inbox Relays:', inboxRelays);
  console.log('📤 Outbox Relays:', outboxRelays);
  console.log(`📊 Total: ${inboxRelays.length} inbox, ${outboxRelays.length} outbox`);
}

/**
 * Clears the relay set cache to force a rebuild
 */
export function clearRelaySetCache(): void {
  console.debug('[NDK.ts] Clearing relay set cache');
  persistentRelaySet = null;
  relaySetLastUpdated = 0;
  // Clear from localStorage as well (client-side only)
  if (typeof window !== 'undefined') {
    localStorage.removeItem('alexandria/relay_set_cache');
  }
}

/**
 * Updates relay stores when user state changes
 * @param ndk NDK instance
 */
export async function refreshRelayStores(ndk: NDK): Promise<void> {
  console.debug('[NDK.ts] Refreshing relay stores due to user state change');
  clearRelaySetCache(); // Clear cache when user state changes
  await updateActiveRelayStores(ndk, true); // Force update
}

/**
 * Updates relay stores when network condition changes
 * @param ndk NDK instance
 */
export async function refreshRelayStoresOnNetworkChange(ndk: NDK): Promise<void> {
  console.debug('[NDK.ts] Refreshing relay stores due to network condition change');
  await updateActiveRelayStores(ndk);
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
  const relaySet = await getActiveRelaySet(ndk);
  const urls = useInbox ? relaySet.inboxRelays : relaySet.outboxRelays;
  
  return createRelaySetFromUrls(urls, ndk);
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

  // Set up custom authentication policy
  ndk.relayAuthDefaultPolicy = NDKRelayAuthPolicies.signIn({ ndk });

  // Connect with better error handling and reduced retry attempts
  let retryCount = 0;
  const maxRetries = 1; // Reduce to 1 retry

  const attemptConnection = async () => {
    // Only attempt connection on client-side
    if (typeof window === 'undefined') {
      console.debug("[NDK.ts] Skipping NDK connection during SSR");
      return;
    }
    
    try {
      await ndk.connect();
      console.debug("[NDK.ts] NDK connected successfully");
      // Update relay stores after connection
      await updateActiveRelayStores(ndk);
      // Start network monitoring for relay optimization
      startNetworkMonitoringForRelays();
    } catch (error) {
      console.warn("[NDK.ts] Failed to connect NDK:", error);
      
      // Only retry a limited number of times
      if (retryCount < maxRetries) {
        retryCount++;
        console.debug(`[NDK.ts] Attempting to reconnect (${retryCount}/${maxRetries})...`);
        // Use a more reasonable retry delay and prevent memory leaks
        setTimeout(() => {
          attemptConnection();
        }, 2000 * retryCount); // Exponential backoff
      } else {
        console.warn("[NDK.ts] Max retries reached, continuing with limited functionality");
        // Still try to update relay stores even if connection failed
        try {
          await updateActiveRelayStores(ndk);
          startNetworkMonitoringForRelays();
        } catch (storeError) {
          console.warn("[NDK.ts] Failed to update relay stores:", storeError);
        }
      }
    }
  };

  // Only attempt connection on client-side
  if (typeof window !== 'undefined') {
    attemptConnection();
  }

  // AI-NOTE: Set up userStore subscription after NDK initialization to prevent initialization errors
  userStore.subscribe(async (userState) => {
    ndkSignedIn.set(userState.signedIn);
    
    // Refresh relay stores when user state changes
    const ndk = get(ndkInstance);
    if (ndk) {
      try {
        await refreshRelayStores(ndk);
      } catch (error) {
        console.warn('[NDK.ts] Failed to refresh relay stores on user state change:', error);
      }
    }
  });

  return ndk;
}

/**
 * Cleans up NDK resources to prevent memory leaks
 * Should be called when the application is shutting down or when NDK needs to be reset
 */
export function cleanupNdk(): void {
  console.debug("[NDK.ts] Cleaning up NDK resources");
  
  const ndk = get(ndkInstance);
  if (ndk) {
    try {
      // Disconnect from all relays
      if (ndk.pool) {
        for (const relay of ndk.pool.relays.values()) {
          relay.disconnect();
        }
      }
      
      // Drain the WebSocket pool
      WebSocketPool.instance.drain();
      
      // Stop network monitoring
      stopNetworkStatusMonitoring();
      
      console.debug("[NDK.ts] NDK cleanup completed");
    } catch (error) {
      console.warn("[NDK.ts] Error during NDK cleanup:", error);
    }
  }
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
    await updateActiveRelayStores(ndk);

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
  
  // Clear relay stores
  activeInboxRelays.set([]);
  activeOutboxRelays.set([]);
  
  // AI-NOTE: 2025-01-08 - Clear persistent relay set on logout
  persistentRelaySet = null;
  relaySetLastUpdated = 0;
  clearPersistentRelaySet(); // Clear persistent storage
  
  // Stop network monitoring
  stopNetworkStatusMonitoring();
  
  // Re-initialize with anonymous instance
  const newNdk = initNdk();
  ndkInstance.set(newNdk);
}


