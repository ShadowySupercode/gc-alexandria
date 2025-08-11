import { get } from "svelte/store";
import type { NostrProfile } from "../../../utils/nostrUtils.ts";
import type { NDKUser, NDKSigner } from "@nostr-dev-kit/ndk";
import { NDKNip07Signer, NDKRelay } from "@nostr-dev-kit/ndk";
import { getUserMetadata } from "../../../utils/nostrUtils.ts";
import { 
  ndkInstance, 
  updateActiveRelayStores 
} from "../../../ndk.ts";
import { loginStorageKey } from "../../../consts.ts";
import { userPubkey } from "../../../stores/authStore.svelte.ts";
import { clearLogin, getUserPreferredRelays, persistLogin } from "./auth_commons.ts";
import { userStore } from "./auth_store.ts";

// Helper functions for relay management
function getRelayStorageKey(user: NDKUser, type: "inbox" | "outbox"): string {
  return `${loginStorageKey}/${user.pubkey}/${type}`;
}

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

// --- Unified login/logout helpers ---

/**
 * Login with NIP-07 browser extension
 */
export async function loginWithExtension() {
  const ndk = get(ndkInstance);
  if (!ndk) throw new Error("NDK not initialized");
  // Only clear previous login state after successful login
  const signer = new NDKNip07Signer();
  const user = await signer.user();
  const npub = user.npub;
  
  
  // Try to fetch user metadata, but don't fail if it times out
  let profile: NostrProfile | null = null;
  try {
    profile = await getUserMetadata(npub, true); // Force fresh fetch
  } catch (error) {
    console.warn("Failed to fetch user metadata during login:", error);
    // Continue with login even if metadata fetch fails
    profile = {
      name: npub.slice(0, 8) + "..." + npub.slice(-4),
      displayName: npub.slice(0, 8) + "..." + npub.slice(-4),
    };
  }
  
  // Fetch user's preferred relays
  const [persistedInboxes, persistedOutboxes] = getPersistedRelays(user);
  for (const relay of persistedInboxes) {
    ndk.addExplicitRelay(relay);
  }
  const [inboxes, outboxes] = await getUserPreferredRelays(ndk, user);
  persistRelays(user, inboxes, outboxes);
  ndk.signer = signer;
  ndk.activeUser = user;
  
  const userState = {
    pubkey: user.pubkey,
    npub,
    profile,
    relays: {
      inbox: Array.from(inboxes ?? persistedInboxes).map((relay) => relay.url),
      outbox: Array.from(outboxes ?? persistedOutboxes).map(
        (relay) => relay.url,
      ),
    },
    loginMethod: "extension" as const,
    ndkUser: user,
    signer,
    signedIn: true,
  };
  
  userStore.set(userState);
  userPubkey.set(user.pubkey);
  
  // Update relay stores with the new user's relays
  try {
    await updateActiveRelayStores(ndk);
  } catch (error) {
    console.warn('Failed to update relay stores:', error);
  }
  
  clearLogin();
  localStorage.removeItem("alexandria/logout/flag");
  persistLogin(user, "extension");
}

/**
 * Login with Amber (NIP-46)
 */
export async function loginWithAmber(amberSigner: NDKSigner, user: NDKUser) {
  const ndk = get(ndkInstance);
  if (!ndk) throw new Error("NDK not initialized");
  // Only clear previous login state after successful login
  const npub = user.npub;
  
  let profile: NostrProfile | null = null;
  try {
    profile = await getUserMetadata(npub, true); // Force fresh fetch
  } catch (error) {
    console.warn("Failed to fetch user metadata during Amber login:", error);
    // Continue with login even if metadata fetch fails
    profile = {
      name: npub.slice(0, 8) + "..." + npub.slice(-4),
      displayName: npub.slice(0, 8) + "..." + npub.slice(-4),
    };
  }
  
  const [persistedInboxes, persistedOutboxes] = getPersistedRelays(user);
  for (const relay of persistedInboxes) {
    ndk.addExplicitRelay(relay);
  }
  const [inboxes, outboxes] = await getUserPreferredRelays(ndk, user);
  persistRelays(user, inboxes, outboxes);
  ndk.signer = amberSigner;
  ndk.activeUser = user;
  
  const userState = {
    pubkey: user.pubkey,
    npub,
    profile,
    relays: {
      inbox: Array.from(inboxes ?? persistedInboxes).map((relay) => relay.url),
      outbox: Array.from(outboxes ?? persistedOutboxes).map(
        (relay) => relay.url,
      ),
    },
    loginMethod: "amber" as const,
    ndkUser: user,
    signer: amberSigner,
    signedIn: true,
  };
  
  userStore.set(userState);
  userPubkey.set(user.pubkey);
  
  // Update relay stores with the new user's relays
  try {
    await updateActiveRelayStores(ndk);
  } catch (error) {
    console.warn('[userStore.ts] loginWithAmber: Failed to update relay stores:', error);
  }
  
  clearLogin();
  localStorage.removeItem("alexandria/logout/flag");
  persistLogin(user, "amber");
}

/**
 * Logout and clear all user state
 */
export function logoutUser() {
  const currentUser = get(userStore);
  if (currentUser.ndkUser) {
    // Clear persisted relays for the user
    localStorage.removeItem(getRelayStorageKey(currentUser.ndkUser, "inbox"));
    localStorage.removeItem(getRelayStorageKey(currentUser.ndkUser, "outbox"));
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
    localStorage.removeItem(key);
  });

  // Clear Amber-specific flags
  localStorage.removeItem("alexandria/amber/fallback");

  // Set a flag to prevent auto-login on next page load
  localStorage.setItem("alexandria/logout/flag", "true");


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
  userPubkey.set(null);

  const ndk = get(ndkInstance);
  if (ndk) {
    ndk.activeUser = undefined;
    ndk.signer = undefined;
  }
}
