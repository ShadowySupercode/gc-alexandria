import { get, writable } from "svelte/store";
import type { NostrProfile } from "../utils/nostrUtils.ts";
import { getUserMetadata } from "../utils/nostrUtils.ts";
import type { NDKSigner, NDKUser } from "@nostr-dev-kit/ndk";
import NDK, { NDKNip07Signer, NDKRelay, NDKRelayAuthPolicies, NDKRelaySet } from "@nostr-dev-kit/ndk";
import { getBestDisplayName, getBestProfileValue } from "../utils/profile_parsing";
import { activeInboxRelays, activeOutboxRelays, updateActiveRelayStores } from "../ndk.ts";
import { loginStorageKey, loginMethodStorageKey } from "../consts.ts";
import { nip19 } from "nostr-tools";

export interface UserState {
  pubkey: string | null;
  npub: string | null;
  profile: NostrProfile | null;
  relays: { inbox: string[]; outbox: string[] };
  loginMethod: "extension" | "amber" | "npub" | null;
  ndkUser: NDKUser | null;
  signer: NDKSigner | undefined;
  signedIn: boolean;
}

export const userStore = writable<UserState>({
  pubkey: null,
  npub: null,
  profile: null,
  relays: { inbox: [], outbox: [] },
  loginMethod: null,
  ndkUser: null,
  signer: undefined,
  signedIn: false,
});

// Helper functions for relay management
function getRelayStorageKey(user: NDKUser, type: "inbox" | "outbox"): string {
  return `${loginStorageKey}/${user.pubkey}/${type}`;
}

function persistRelays(
  user: NDKUser,
  inboxes: Set<NDKRelay>,
  outboxes: Set<NDKRelay>,
): void {
  // Only access localStorage on client-side
  if (typeof window === "undefined") return;

  localStorage.setItem(
    getRelayStorageKey(user, "inbox"),
    JSON.stringify(Array.from(inboxes).map((relay) => relay.url)),
  );
  localStorage.setItem(
    getRelayStorageKey(user, "outbox"),
    JSON.stringify(Array.from(outboxes).map((relay) => relay.url)),
  );
}

function getPersistedRelays(user: NDKUser): [Set<string>, Set<string>] {
  // Only access localStorage on client-side
  if (typeof window === "undefined") {
    return [new Set<string>(), new Set<string>()];
  }

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

async function getUserPreferredRelays(
  ndk: NDK,
  user: NDKUser,
  fallbacks: readonly string[] = [
    ...get(activeInboxRelays),
    ...get(activeOutboxRelays),
  ],
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
    const relayMap = await globalThis.nostr?.getRelays?.();
    Object.entries(relayMap ?? {}).forEach(
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
  } else {
    relayList.tags.forEach((tag: string[]) => {
      switch (tag[0]) {
        case "r":
          inboxRelays.add(
            new NDKRelay(tag[1], NDKRelayAuthPolicies.signIn({ ndk }), ndk),
          );
          break;
        case "w":
          outboxRelays.add(
            new NDKRelay(tag[1], NDKRelayAuthPolicies.signIn({ ndk }), ndk),
          );
          break;
        default:
          inboxRelays.add(
            new NDKRelay(tag[1], NDKRelayAuthPolicies.signIn({ ndk }), ndk),
          );
          outboxRelays.add(
            new NDKRelay(tag[1], NDKRelayAuthPolicies.signIn({ ndk }), ndk),
          );
          break;
      }
    });
  }

  return [inboxRelays, outboxRelays];
}

// --- Unified login/logout helpers ---

// AI-NOTE:  Authentication persistence system
// The application stores login information in localStorage to persist authentication across page refreshes.
// The layout component automatically restores this authentication state on page load.
// This prevents users from being logged out when refreshing the page.


function persistLogin(user: NDKUser, method: "extension" | "amber" | "npub") {
  // Only access localStorage on client-side
  if (typeof window === "undefined") return;

  localStorage.setItem(loginStorageKey, user.pubkey);
  localStorage.setItem(loginMethodStorageKey, method);
}

function clearLogin() {
  localStorage.removeItem(loginStorageKey);
  localStorage.removeItem(loginMethodStorageKey);
}

/**
 * Common profile fetching logic with retry mechanism
 */
async function fetchUserProfileWithRetry(npub: string, ndk: NDK, maxRetries: number = 3): Promise<NostrProfile | null> {
  let retryCount = 0;
  
  while (retryCount < maxRetries) {
    try {
      const profile = await getUserMetadata(npub, ndk, true); // Force fresh fetch
      console.log(`Profile fetch attempt ${retryCount + 1} successful:`, profile);
      return profile;
    } catch (retryError) {
      retryCount++;
      console.warn(`Profile fetch attempt ${retryCount} failed:`, retryError);
      
      if (retryCount < maxRetries) {
        const delay = retryCount * 1000; // 1s, 2s delays
        console.log(`Retrying profile fetch in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  console.warn("All profile fetch attempts failed, getUserMetadata will handle fallback");
  return null;
}

/**
 * Common user state creation logic
 */
function createUserState(
  user: NDKUser,
  profile: NostrProfile | null,
  inboxes: Set<NDKRelay>,
  outboxes: Set<NDKRelay>,
  loginMethod: "extension" | "amber" | "npub",
  signer: NDKSigner | null
): UserState {
  return {
    pubkey: user.pubkey,
    npub: user.npub,
    profile,
    relays: {
      inbox: Array.from(inboxes).map((relay) => relay.url),
      outbox: Array.from(outboxes).map((relay) => relay.url),
    },
    loginMethod,
    ndkUser: user,
    signer: signer || undefined,
    signedIn: true,
  };
}

/**
 * Common login completion logic
 */
async function completeLogin(
  user: NDKUser,
  profile: NostrProfile | null,
  ndk: NDK,
  loginMethod: "extension" | "amber" | "npub",
  signer: NDKSigner | null
): Promise<void> {
  // Fetch user's preferred relays
  const [persistedInboxes, persistedOutboxes] = getPersistedRelays(user);
  for (const relay of persistedInboxes) {
    ndk.addExplicitRelay(relay);
  }
  const [inboxes, outboxes] = await getUserPreferredRelays(ndk, user);
  persistRelays(user, inboxes, outboxes);
  
  // Set NDK user and signer
  ndk.signer = signer || undefined;
  ndk.activeUser = user;

  const userState = createUserState(user, profile, inboxes ?? persistedInboxes, outboxes ?? persistedOutboxes, loginMethod, signer);

  console.log(`Login with ${loginMethod} - setting userStore with:`, userState);
  userStore.set(userState);

  // Update relay stores with the new user's relays
  try {
    console.debug(`[userStore.ts] loginWith${loginMethod}: Updating relay stores for authenticated user`);
    await updateActiveRelayStores(ndk, true); // Force update to rebuild relay set for authenticated user
  } catch (error) {
    console.warn(`[userStore.ts] loginWith${loginMethod}: Failed to update relay stores:`, error);
  }

  // Schedule delayed profile refresh if needed
  if (!profile || (!getBestProfileValue(profile.picture) && !getBestDisplayName(profile) && getBestProfileValue(profile.name)?.includes("..."))) {
    console.log(`Login with ${loginMethod} - scheduling delayed profile refresh...`);
    setTimeout(async () => {
      try {
        console.log(`Login with ${loginMethod} - attempting delayed profile refresh...`);
        const refreshedProfile = await getUserMetadata(user.npub, ndk, true);
        if (refreshedProfile && (getBestProfileValue(refreshedProfile.picture) || getBestDisplayName(refreshedProfile))) {
          console.log(`Login with ${loginMethod} - delayed profile refresh successful:`, refreshedProfile);
          const currentState = get(userStore);
          userStore.set({
            ...currentState,
            profile: refreshedProfile,
          });
        }
      } catch (error) {
        console.warn(`Login with ${loginMethod} - delayed profile refresh failed:`, error);
      }
    }, 5000); // Wait 5 seconds before attempting refresh
  }

  clearLogin();
  // Only access localStorage on client-side
  if (typeof window !== "undefined") {
    localStorage.removeItem("alexandria/logout/flag");
  }
  persistLogin(user, loginMethod);
}

/**
 * Login with NIP-07 browser extension
 */
export async function loginWithExtension(ndk: NDK) {
  if (!ndk) throw new Error("NDK not initialized");
  
  const signer = new NDKNip07Signer();
  const user = await signer.user();
  const npub = user.npub;

  console.log("Login with extension - fetching profile for npub:", npub);

  // Fetch user profile with retry logic
  const profile = await fetchUserProfileWithRetry(npub, ndk);
  
  // Complete the login process
  await completeLogin(user, profile, ndk, "extension", signer);
}

/**
 * Login with Amber (NIP-46)
 */
export async function loginWithAmber(
  amberSigner: NDKSigner,
  user: NDKUser,
  ndk: NDK,
) {
  if (!ndk) throw new Error("NDK not initialized");
  
  const npub = user.npub;
  console.log("Login with Amber - fetching profile for npub:", npub);

  // Fetch user profile with retry logic
  const profile = await fetchUserProfileWithRetry(npub, ndk);
  
  // Complete the login process
  await completeLogin(user, profile, ndk, "amber", amberSigner);
}

/**
 * Login with npub (read-only)
 */
export async function loginWithNpub(pubkeyOrNpub: string, ndk: NDK) {
  if (!ndk) {
    throw new Error("NDK not initialized");
  }

  // Decode/encode npub
  let hexPubkey: string;
  if (pubkeyOrNpub.startsWith("npub1")) {
    try {
      const decoded = nip19.decode(pubkeyOrNpub);
      if (decoded.type !== "npub") {
        throw new Error("Invalid npub format");
      }
      hexPubkey = decoded.data;
    } catch (e) {
      console.error("Failed to decode npub:", pubkeyOrNpub, e);
      throw e;
    }
  } else {
    hexPubkey = pubkeyOrNpub;
  }
  
  let npub: string;
  try {
    npub = nip19.npubEncode(hexPubkey);
  } catch (e) {
    console.error("Failed to encode npub from hex pubkey:", hexPubkey, e);
    throw e;
  }

  console.log("Login with npub - fetching profile for npub:", npub);

  const user = ndk.getUser({ npub });

  // Update relay stores to ensure we have relays available
  try {
    console.debug("[userStore.ts] loginWithNpub: Updating relay stores for authenticated user");
    await updateActiveRelayStores(ndk);
  } catch (error) {
    console.warn("[userStore.ts] loginWithNpub: Failed to update relay stores:", error);
  }

  // Wait a moment for relay stores to be properly initialized
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Fetch user profile with retry logic
  const profile = await fetchUserProfileWithRetry(npub, ndk);

  // Set NDK user (no signer for read-only mode)
  ndk.signer = undefined;
  ndk.activeUser = user;

  const userState = {
    pubkey: user.pubkey,
    npub,
    profile,
    relays: { inbox: [], outbox: [] },
    loginMethod: "npub" as const,
    ndkUser: user,
    signer: undefined,
    signedIn: true,
  };

  console.log("Login with npub - setting userStore with:", userState);
  userStore.set(userState);

  // Schedule delayed profile refresh if needed
  if (!profile || (!getBestProfileValue(profile.picture) && !getBestDisplayName(profile) && getBestProfileValue(profile.name)?.includes("..."))) {
    console.log("Login with npub - scheduling delayed profile refresh...");
    setTimeout(async () => {
      try {
        console.log("Login with npub - attempting delayed profile refresh...");
        const refreshedProfile = await getUserMetadata(npub, ndk, true);
        if (refreshedProfile && (getBestProfileValue(refreshedProfile.picture) || getBestDisplayName(refreshedProfile))) {
          console.log("Login with npub - delayed profile refresh successful:", refreshedProfile);
          const currentState = get(userStore);
          userStore.set({
            ...currentState,
            profile: refreshedProfile,
          });
        }
      } catch (error) {
        console.warn("Login with npub - delayed profile refresh failed:", error);
      }
    }, 5000); // Wait 5 seconds before attempting refresh
  }

  clearLogin();
  // Only access localStorage on client-side
  if (typeof window !== "undefined") {
    localStorage.removeItem("alexandria/logout/flag");
  }
  persistLogin(user, "npub");
}

/**
 * Logout and clear all user state
 */
export function logoutUser(ndk: NDK) {
  console.log("Logging out user...");
  const currentUser = get(userStore);

  // Only access localStorage on client-side
  if (typeof window !== "undefined") {
    if (currentUser.ndkUser) {
      // Clear persisted relays for the user
      localStorage.removeItem(getRelayStorageKey(currentUser.ndkUser, "inbox"));
      localStorage.removeItem(
        getRelayStorageKey(currentUser.ndkUser, "outbox"),
      );
    }

    // Clear all possible login states from localStorage
    clearLogin();

    // Also clear any other potential login keys that might exist
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (
        key &&
        (key.includes("login") ||
          key.includes("nostr") ||
          key.includes("user") ||
          key.includes("alexandria") ||
          key === "pubkey")
      ) {
        keysToRemove.push(key);
      }
    }

    // Specifically target the login storage key
    keysToRemove.push("alexandria/login/pubkey");
    keysToRemove.push("alexandria/login/method");

    keysToRemove.forEach((key) => {
      console.log("Removing localStorage key:", key);
      localStorage.removeItem(key);
    });

    // Clear Amber-specific flags
    localStorage.removeItem("alexandria/amber/fallback");

    // Set a flag to prevent auto-login on next page load
    localStorage.setItem("alexandria/logout/flag", "true");

    console.log("Cleared all login data from localStorage");
  }

  userStore.set({
    pubkey: null,
    npub: null,
    profile: null,
    relays: { inbox: [], outbox: [] },
    loginMethod: null,
    ndkUser: null,
    signer: undefined,
    signedIn: false,
  });

  if (ndk) {
    ndk.activeUser = undefined;
    ndk.signer = undefined;
  }

  console.log("Logout complete");
}
