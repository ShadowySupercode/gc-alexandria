// AI-NOTE: To maintain good key security practices, Alexandria will not work with private keys in
// server-side code. This file offers a subset of authentication functionality that can be safely
// run on the server. For now, this is limited to read-only public key authentication. The server
// will not sign events or authorize into relays on the user's behalf.

import { get } from "svelte/store";
import { ndkInstance } from "../../../ndk.ts";
import { nip19 } from "nostr-tools";
import { getUserMetadata, NostrProfile } from "../../../utils/nostrUtils.ts";
import { userStore } from "./auth_store.ts";
import { userPubkey } from "../../../stores/authStore.svelte.ts";
import { updateActiveRelayStores } from "../../../ndk.ts";
import { clearLogin, persistLogin } from "./auth_commons.ts";

/**
 * Login with npub (read-only)
 */
export async function loginWithNpub(pubkeyOrNpub: string) {
  const ndk = get(ndkInstance);
  if (!ndk) throw new Error("NDK not initialized");
  // Only clear previous login state after successful login
  let hexPubkey: string;
  if (pubkeyOrNpub.startsWith("npub")) {
    try {
      hexPubkey = nip19.decode(pubkeyOrNpub).data as string;
    } catch (e) {
      console.error("Failed to decode hex pubkey from npub:", pubkeyOrNpub, e);
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
    
  const user = ndk.getUser({ npub });
  let profile: NostrProfile | null = null;
  try {
    profile = await getUserMetadata(npub, true); // Force fresh fetch
  } catch (error) {
    console.warn("Failed to fetch user metadata during npub login:", error);
    // Continue with login even if metadata fetch fails
    profile = {
      name: npub.slice(0, 8) + "..." + npub.slice(-4),
      displayName: npub.slice(0, 8) + "..." + npub.slice(-4),
    };
  }
  
  ndk.signer = undefined;
  ndk.activeUser = user;
  
  const userState = {
    pubkey: user.pubkey,
    npub,
    profile,
    relays: { inbox: [], outbox: [] },
    loginMethod: "npub" as const,
    ndkUser: user,
    signer: null,
    signedIn: true,
  };
  
  userStore.set(userState);
  userPubkey.set(user.pubkey);
  
  // Update relay stores with the new user's relays
  try {
    await updateActiveRelayStores(ndk);
  } catch (error) {
    console.warn('[userStore.ts] loginWithNpub: Failed to update relay stores:', error);
  }
  
  clearLogin();
  localStorage.removeItem("alexandria/logout/flag");
  persistLogin(user, "npub");
}