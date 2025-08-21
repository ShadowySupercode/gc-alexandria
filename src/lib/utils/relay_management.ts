import NDK, { NDKKind, NDKRelay, NDKUser } from "@nostr-dev-kit/ndk";
import {
  anonymousRelays,
  localRelays,
  lowbandwidthRelays,
  searchRelays,
  secondaryRelays,
} from "../consts.ts";
import { getRelaySetForNetworkCondition } from "./network_detection.ts";
import { networkCondition } from "../stores/networkStore.ts";
import { get } from "svelte/store";

/**
 * Normalizes a relay URL to a standard format
 * @param url The relay URL to normalize
 * @returns The normalized relay URL
 */
export function normalizeRelayUrl(url: string): string {
  let normalized = url.toLowerCase().trim();

  // Ensure protocol is present
  if (!normalized.startsWith("ws://") && !normalized.startsWith("wss://")) {
    normalized = "wss://" + normalized;
  }

  // Remove trailing slash
  normalized = normalized.replace(/\/$/, "");

  return normalized;
}

/**
 * Normalizes an array of relay URLs
 * @param urls Array of relay URLs to normalize
 * @returns Array of normalized relay URLs
 */
export function normalizeRelayUrls(urls: string[]): string[] {
  return urls.map(normalizeRelayUrl);
}

/**
 * Removes duplicates from an array of relay URLs
 * @param urls Array of relay URLs
 * @returns Array of unique relay URLs
 */
export function deduplicateRelayUrls(urls: string[]): string[] {
  const normalized = normalizeRelayUrls(urls);
  return [...new Set(normalized)];
}

/**
 * Tests connection to a local relay (ws:// protocol)
 * @param relayUrl The local relay URL to test (should be ws://)
 * @param ndk The NDK instance
 * @returns Promise that resolves to connection status
 */
export function testLocalRelayConnection(
  relayUrl: string,
  ndk: NDK,
): Promise<{
  connected: boolean;
  requiresAuth: boolean;
  error?: string;
  actualUrl?: string;
}> {
  // Only test connections on client-side
  if (typeof window === "undefined") {
    return Promise.resolve({
      connected: false,
      requiresAuth: false,
      error: "Server-side rendering - connection test skipped",
      actualUrl: relayUrl,
    });
  }

  return new Promise((resolve) => {
    try {
      // Ensure the URL is using ws:// protocol for local relays
      const localUrl = relayUrl.replace(/^wss:\/\//, "ws://");

      // Use the existing NDK instance instead of creating a new one
      const relay = new NDKRelay(localUrl, undefined, ndk);
      let authRequired = false;
      let connected = false;
      let error: string | undefined;
      let actualUrl: string | undefined;

      const timeout = setTimeout(() => {
        try {
          relay.disconnect();
        } catch {
          // Silently ignore disconnect errors
        }
        resolve({
          connected: false,
          requiresAuth: authRequired,
          error: "Connection timeout",
          actualUrl,
        });
      }, 3000);

      // Wrap all event handlers in try-catch to prevent errors from bubbling up
      relay.on("connect", () => {
        try {
          connected = true;
          actualUrl = localUrl;
          clearTimeout(timeout);
          relay.disconnect();
          resolve({
            connected: true,
            requiresAuth: authRequired,
            error,
            actualUrl,
          });
        } catch {
          // Silently handle any errors in connect handler
          clearTimeout(timeout);
          resolve({
            connected: false,
            requiresAuth: false,
            error: "Connection handler error",
            actualUrl: localUrl,
          });
        }
      });

      relay.on("notice", (message: string) => {
        try {
          if (message.includes("auth-required")) {
            authRequired = true;
          }
        } catch {
          // Silently ignore notice handler errors
        }
      });

      relay.on("disconnect", () => {
        try {
          if (!connected) {
            error = "Connection failed";
            clearTimeout(timeout);
            resolve({
              connected: false,
              requiresAuth: authRequired,
              error,
              actualUrl,
            });
          }
        } catch {
          // Silently handle any errors in disconnect handler
          clearTimeout(timeout);
          resolve({
            connected: false,
            requiresAuth: false,
            error: "Disconnect handler error",
            actualUrl: localUrl,
          });
        }
      });

      // Wrap the connect call in try-catch
      try {
        relay.connect();
      } catch (connectError) {
        // Silently handle connection errors
        clearTimeout(timeout);
        resolve({
          connected: false,
          requiresAuth: false,
          error: "Connection failed",
          actualUrl: localUrl,
        });
      }
    } catch (outerError) {
      // Catch any other errors that might occur during setup
      resolve({
        connected: false,
        requiresAuth: false,
        error: "Setup failed",
        actualUrl: relayUrl,
      });
    }
  });
}

/**
 * Tests connection to a remote relay (wss:// protocol)
 * @param relayUrl The remote relay URL to test
 * @param ndk The NDK instance
 * @returns Promise that resolves to connection status
 */
export function testRemoteRelayConnection(
  relayUrl: string,
  ndk: NDK,
): Promise<{
  connected: boolean;
  requiresAuth: boolean;
  error?: string;
  actualUrl?: string;
}> {
  // Only test connections on client-side
  if (typeof window === "undefined") {
    return Promise.resolve({
      connected: false,
      requiresAuth: false,
      error: "Server-side rendering - connection test skipped",
      actualUrl: relayUrl,
    });
  }

  return new Promise((resolve) => {
    // Ensure the URL is using wss:// protocol for remote relays
    const secureUrl = relayUrl.replace(/^ws:\/\//, "wss://");

    console.debug(
      `[relay_management.ts] Testing remote relay connection: ${secureUrl}`,
    );

    // Use the existing NDK instance instead of creating a new one
    const relay = new NDKRelay(secureUrl, undefined, ndk);
    let authRequired = false;
    let connected = false;
    let error: string | undefined;
    let actualUrl: string | undefined;

    const timeout = setTimeout(() => {
      console.debug(
        `[relay_management.ts] Relay ${secureUrl} connection timeout`,
      );
      relay.disconnect();
      resolve({
        connected: false,
        requiresAuth: authRequired,
        error: "Connection timeout",
        actualUrl,
      });
    }, 3000);

    relay.on("connect", () => {
      console.debug(
        `[relay_management.ts] Relay ${secureUrl} connected successfully`,
      );
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
      }
    });

    relay.on("disconnect", () => {
      if (!connected) {
        console.debug(
          `[relay_management.ts] Relay ${secureUrl} disconnected without connecting`,
        );
        error = "Connection failed";
        clearTimeout(timeout);
        resolve({
          connected: false,
          requiresAuth: authRequired,
          error,
          actualUrl,
        });
      }
    });

    relay.connect();
  });
}

/**
 * Tests connection to a relay and returns connection status
 * @param relayUrl The relay URL to test
 * @param ndk The NDK instance
 * @returns Promise that resolves to connection status
 */
export function testRelayConnection(
  relayUrl: string,
  ndk: NDK,
): Promise<{
  connected: boolean;
  requiresAuth: boolean;
  error?: string;
  actualUrl?: string;
}> {
  // Determine if this is a local or remote relay
  if (relayUrl.includes("localhost") || relayUrl.includes("127.0.0.1")) {
    return testLocalRelayConnection(relayUrl, ndk);
  } else {
    return testRemoteRelayConnection(relayUrl, ndk);
  }
}

/**
 * Tests connection to local relays
 * @param localRelayUrls Array of local relay URLs to test
 * @param ndk NDK instance
 * @returns Promise that resolves to array of working local relay URLs
 */
async function testLocalRelays(
  localRelayUrls: string[],
  ndk: NDK,
): Promise<string[]> {
  try {
    const workingRelays: string[] = [];

    if (localRelayUrls.length === 0) {
      return workingRelays;
    }

    // Test local relays quietly, without logging failures
    await Promise.all(
      localRelayUrls.map(async (url) => {
        try {
          const result = await testLocalRelayConnection(url, ndk);
          if (result.connected) {
            workingRelays.push(url);
            console.debug(
              `[relay_management.ts] Local relay connected: ${url}`,
            );
          }
          // Don't log failures - local relays are optional
        } catch {
          // Silently ignore local relay failures - they're optional
        }
      }),
    );

    if (workingRelays.length > 0) {
      console.info(
        `[relay_management.ts] Found ${workingRelays.length} working local relays`,
      );
    }
    return workingRelays;
  } catch {
    // If anything goes wrong with the entire local relay testing process,
    // just return an empty array silently
    return [];
  }
}

/**
 * Discovers local relays by testing common localhost URLs
 * @param ndk NDK instance
 * @returns Promise that resolves to array of working local relay URLs
 */
export async function discoverLocalRelays(ndk: NDK): Promise<string[]> {
  try {
    // If no local relays are configured, return empty array
    if (localRelays.length === 0) {
      console.debug("[relay_management.ts] No local relays configured");
      return [];
    }

    // Convert wss:// URLs from consts to ws:// for local testing
    const localRelayUrls = localRelays.map((url: string) =>
      url.replace(/^wss:\/\//, "ws://")
    );

    const workingRelays = await testLocalRelays(localRelayUrls, ndk);

    // If no local relays are working, return empty array
    // The network detection logic will provide fallback relays
    return workingRelays;
  } catch {
    // Silently fail and return empty array
    return [];
  }
}

/**
 * Fetches user's local relays from kind 10432 event
 * @param ndk NDK instance
 * @param user User to fetch local relays for
 * @returns Promise that resolves to array of local relay URLs
 */
export async function getUserLocalRelays(
  ndk: NDK,
  user: NDKUser,
): Promise<string[]> {
  try {
    const localRelayEvent = await ndk.fetchEvent(
      {
        kinds: [10432 as NDKKind],
        authors: [user.pubkey],
      },
      {
        groupable: false,
        skipVerification: false,
        skipValidation: false,
      },
    );

    if (!localRelayEvent) {
      return [];
    }

    const localRelays: string[] = [];
    localRelayEvent.tags.forEach((tag) => {
      if (tag[0] === "r" && tag[1]) {
        localRelays.push(tag[1]);
      }
    });

    return localRelays;
  } catch (error) {
    console.info(
      "[relay_management.ts] Error fetching user local relays:",
      error,
    );
    return [];
  }
}

/**
 * Fetches user's blocked relays from kind 10006 event
 * @param ndk NDK instance
 * @param user User to fetch blocked relays for
 * @returns Promise that resolves to array of blocked relay URLs
 */
export async function getUserBlockedRelays(
  ndk: NDK,
  user: NDKUser,
): Promise<string[]> {
  try {
    const blockedRelayEvent = await ndk.fetchEvent(
      {
        kinds: [10006],
        authors: [user.pubkey],
      },
      {
        groupable: false,
        skipVerification: false,
        skipValidation: false,
      },
    );

    if (!blockedRelayEvent) {
      return [];
    }

    const blockedRelays: string[] = [];
    blockedRelayEvent.tags.forEach((tag) => {
      if (tag[0] === "r" && tag[1]) {
        blockedRelays.push(tag[1]);
      }
    });

    return blockedRelays;
  } catch (error) {
    console.info(
      "[relay_management.ts] Error fetching user blocked relays:",
      error,
    );
    return [];
  }
}

/**
 * Fetches user's outbox relays from NIP-65 relay list
 * @param ndk NDK instance
 * @param user User to fetch outbox relays for
 * @returns Promise that resolves to array of outbox relay URLs
 */
export async function getUserOutboxRelays(
  ndk: NDK,
  user: NDKUser,
): Promise<string[]> {
  try {
    console.debug(
      "[relay_management.ts] Fetching outbox relays for user:",
      user.pubkey,
    );
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
    );

    if (!relayList) {
      console.debug("[relay_management.ts] No relay list found for user");
      return [];
    }

    console.debug(
      "[relay_management.ts] Found relay list event:",
      relayList.id,
    );
    console.debug("[relay_management.ts] Relay list tags:", relayList.tags);

    const outboxRelays: string[] = [];
    relayList.tags.forEach((tag) => {
      console.debug("[relay_management.ts] Processing tag:", tag);
      if (tag[0] === "w" && tag[1]) {
        outboxRelays.push(tag[1]);
        console.debug("[relay_management.ts] Added outbox relay:", tag[1]);
      } else if (tag[0] === "r" && tag[1]) {
        // Some relay lists use 'r' for both inbox and outbox
        outboxRelays.push(tag[1]);
        console.debug("[relay_management.ts] Added relay (r tag):", tag[1]);
      } else {
        console.debug(
          "[relay_management.ts] Skipping tag:",
          tag[0],
          "value:",
          tag[1],
        );
      }
    });

    console.debug("[relay_management.ts] Final outbox relays:", outboxRelays);
    return outboxRelays;
  } catch (error) {
    console.info(
      "[relay_management.ts] Error fetching user outbox relays:",
      error,
    );
    return [];
  }
}

/**
 * Gets browser extension's relay configuration by querying the extension directly
 * @returns Promise that resolves to array of extension relay URLs
 */
export async function getExtensionRelays(): Promise<string[]> {
  try {
    // Check if we're in a browser environment with extension support
    if (typeof window === "undefined" || !globalThis.nostr) {
      console.debug("[relay_management.ts] No globalThis.nostr available");
      return [];
    }

    console.debug(
      "[relay_management.ts] Extension available, checking for getRelays()",
    );
    const extensionRelays: string[] = [];

    // Try to get relays from the extension's API
    // Different extensions may expose their relay config differently
    if (globalThis.nostr.getRelays) {
      console.debug(
        "[relay_management.ts] getRelays() method found, calling it...",
      );
      try {
        const relays = await globalThis.nostr.getRelays();
        console.debug("[relay_management.ts] getRelays() returned:", relays);
        if (relays && typeof relays === "object") {
          // Convert relay object to array of URLs
          const relayUrls = Object.keys(relays);
          extensionRelays.push(...relayUrls);
          console.debug(
            "[relay_management.ts] Got relays from extension:",
            relayUrls,
          );
        }
      } catch (error) {
        console.debug(
          "[relay_management.ts] Extension getRelays() failed:",
          error,
        );
      }
    } else {
      console.debug(
        "[relay_management.ts] getRelays() method not found on globalThis.nostr",
      );
    }

    // If getRelays() didn't work, try alternative methods
    if (extensionRelays.length === 0) {
      // Some extensions might expose relays through other methods
      // This is a fallback for extensions that don't expose getRelays()
      console.debug(
        "[relay_management.ts] Extension does not expose relay configuration",
      );
    }

    console.debug(
      "[relay_management.ts] Final extension relays:",
      extensionRelays,
    );
    return extensionRelays;
  } catch (error) {
    console.debug(
      "[relay_management.ts] Error getting extension relays:",
      error,
    );
    return [];
  }
}

/**
 * Tests a set of relays in batches to avoid overwhelming them
 * @param relayUrls Array of relay URLs to test
 * @param ndk NDK instance
 * @returns Promise that resolves to array of working relay URLs
 */
async function testRelaySet(relayUrls: string[], ndk: NDK): Promise<string[]> {
  const workingRelays: string[] = [];
  const maxConcurrent = 2; // Reduce to 2 relays at a time to avoid overwhelming them

  console.debug(
    `[relay_management.ts] Testing ${relayUrls.length} relays in batches of ${maxConcurrent}`,
  );
  console.debug(`[relay_management.ts] Relay URLs to test:`, relayUrls);

  for (let i = 0; i < relayUrls.length; i += maxConcurrent) {
    const batch = relayUrls.slice(i, i + maxConcurrent);
    console.debug(
      `[relay_management.ts] Testing batch ${
        Math.floor(i / maxConcurrent) + 1
      }:`,
      batch,
    );

    const batchPromises = batch.map(async (url) => {
      try {
        console.debug(`[relay_management.ts] Testing relay: ${url}`);
        const result = await testRelayConnection(url, ndk);
        console.debug(
          `[relay_management.ts] Relay ${url} test result:`,
          result,
        );
        return result.connected ? url : null;
      } catch (error) {
        console.debug(
          `[relay_management.ts] Failed to test relay ${url}:`,
          error,
        );
        return null;
      }
    });

    const batchResults = await Promise.allSettled(batchPromises);
    const batchWorkingRelays = batchResults
      .filter((result): result is PromiseFulfilledResult<string | null> =>
        result.status === "fulfilled"
      )
      .map((result) => result.value)
      .filter((url): url is string => url !== null);

    console.debug(
      `[relay_management.ts] Batch ${
        Math.floor(i / maxConcurrent) + 1
      } working relays:`,
      batchWorkingRelays,
    );
    workingRelays.push(...batchWorkingRelays);
  }

  console.debug(
    `[relay_management.ts] Total working relays after testing:`,
    workingRelays,
  );
  return workingRelays;
}

/**
 * Builds a complete relay set for a user, including local, user-specific, and fallback relays
 * @param ndk NDK instance
 * @param user NDKUser or null for anonymous access
 * @returns Promise that resolves to inbox and outbox relay arrays
 */
export async function buildCompleteRelaySet(
  ndk: NDK,
  user: NDKUser | null,
): Promise<{ inboxRelays: string[]; outboxRelays: string[] }> {
  console.debug(
    "[relay_management.ts] buildCompleteRelaySet: Starting with user:",
    user?.pubkey || "null",
  );

  // Discover local relays first
  const discoveredLocalRelays = await discoverLocalRelays(ndk);
  console.debug(
    "[relay_management.ts] buildCompleteRelaySet: Discovered local relays:",
    discoveredLocalRelays,
  );

  // Get user-specific relays if available
  let userOutboxRelays: string[] = [];
  let userLocalRelays: string[] = [];
  let blockedRelays: string[] = [];
  let extensionRelays: string[] = [];

  if (user) {
    console.debug(
      "[relay_management.ts] buildCompleteRelaySet: Fetching user-specific relays for:",
      user.pubkey,
    );

    try {
      userOutboxRelays = await getUserOutboxRelays(ndk, user);
      console.debug(
        "[relay_management.ts] buildCompleteRelaySet: User outbox relays:",
        userOutboxRelays,
      );
    } catch (error) {
      console.debug(
        "[relay_management.ts] Error fetching user outbox relays:",
        error,
      );
    }

    try {
      userLocalRelays = await getUserLocalRelays(ndk, user);
      console.debug(
        "[relay_management.ts] buildCompleteRelaySet: User local relays:",
        userLocalRelays,
      );
    } catch (error) {
      console.debug(
        "[relay_management.ts] Error fetching user local relays:",
        error,
      );
    }

    try {
      blockedRelays = await getUserBlockedRelays(ndk, user);
      console.debug(
        "[relay_management.ts] buildCompleteRelaySet: User blocked relays:",
        blockedRelays,
      );
    } catch {
      // Silently ignore blocked relay fetch errors
    }

    try {
      extensionRelays = await getExtensionRelays();
      console.debug(
        "[relay_management.ts] Extension relays gathered:",
        extensionRelays,
      );
    } catch (error) {
      console.debug(
        "[relay_management.ts] Error fetching extension relays:",
        error,
      );
    }
  } else {
    console.debug(
      "[relay_management.ts] buildCompleteRelaySet: No user provided, skipping user-specific relays",
    );
  }

  // Build initial relay sets and deduplicate
  const finalInboxRelays = deduplicateRelayUrls([
    ...discoveredLocalRelays,
    ...userLocalRelays,
  ]);
  const finalOutboxRelays = deduplicateRelayUrls([
    ...discoveredLocalRelays,
    ...userOutboxRelays,
    ...extensionRelays,
  ]);

  // Test relays and filter out non-working ones
  let testedInboxRelays: string[] = [];
  let testedOutboxRelays: string[] = [];

  if (finalInboxRelays.length > 0) {
    testedInboxRelays = await testRelaySet(finalInboxRelays, ndk);
  }

  if (finalOutboxRelays.length > 0) {
    testedOutboxRelays = await testRelaySet(finalOutboxRelays, ndk);
  }

  // If no relays passed testing, use remote relays without testing
  if (testedInboxRelays.length === 0 && testedOutboxRelays.length === 0) {
    const remoteRelays = deduplicateRelayUrls([
      ...secondaryRelays,
      ...searchRelays,
    ]);
    return {
      inboxRelays: remoteRelays,
      outboxRelays: remoteRelays,
    };
  }

  // Always include some remote relays as fallback, even when local relays are working
  const fallbackRelays = deduplicateRelayUrls([
    ...anonymousRelays,
    ...secondaryRelays,
  ]);

  // Use tested relays and add fallback relays
  const inboxRelays = testedInboxRelays.length > 0
    ? deduplicateRelayUrls([...testedInboxRelays, ...fallbackRelays])
    : deduplicateRelayUrls(fallbackRelays);
  const outboxRelays = testedOutboxRelays.length > 0
    ? deduplicateRelayUrls([...testedOutboxRelays, ...fallbackRelays])
    : deduplicateRelayUrls(fallbackRelays);

  // Apply network condition optimization
  const currentNetworkCondition = get(networkCondition);
  const networkOptimizedRelaySet = getRelaySetForNetworkCondition(
    currentNetworkCondition,
    discoveredLocalRelays,
    lowbandwidthRelays,
    { inboxRelays, outboxRelays },
  );

  // Filter out blocked relays and deduplicate final sets
  const finalRelaySet = {
    inboxRelays: deduplicateRelayUrls(
      networkOptimizedRelaySet.inboxRelays.filter((r: string) =>
        !blockedRelays.includes(r)
      ),
    ),
    outboxRelays: deduplicateRelayUrls(
      networkOptimizedRelaySet.outboxRelays.filter((r: string) =>
        !blockedRelays.includes(r)
      ),
    ),
  };

  // Ensure we always have at least some relays
  if (
    finalRelaySet.inboxRelays.length === 0 &&
    finalRelaySet.outboxRelays.length === 0
  ) {
    console.warn(
      "[relay_management.ts] No relays available, using anonymous relays as final fallback",
    );
    return {
      inboxRelays: deduplicateRelayUrls(anonymousRelays),
      outboxRelays: deduplicateRelayUrls(anonymousRelays),
    };
  }

  console.debug(
    "[relay_management.ts] buildCompleteRelaySet: Final relay sets - inbox:",
    finalRelaySet.inboxRelays.length,
    "outbox:",
    finalRelaySet.outboxRelays.length,
  );
  console.debug(
    "[relay_management.ts] buildCompleteRelaySet: Final inbox relays:",
    finalRelaySet.inboxRelays,
  );
  console.debug(
    "[relay_management.ts] buildCompleteRelaySet: Final outbox relays:",
    finalRelaySet.outboxRelays,
  );

  return finalRelaySet;
}
