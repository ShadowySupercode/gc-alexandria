import { getPersistedLogin, initNdk, ndkInstance } from "../lib/ndk.ts";
import { userStore } from "../lib/stores/userStore.ts";
import { get } from "svelte/store";
import type { LayoutLoad } from "./$types";

export const ssr = false;

export const load: LayoutLoad = async () => {
  console.debug("[+layout.ts] Loading layout...");

  // Initialize NDK if not already done
  const ndk = initNdk();
  ndkInstance.set(ndk);

  // Get persisted login if available
  const persistedLogin = getPersistedLogin();
  if (persistedLogin) {
    console.debug("[+layout.ts] Found persisted login, attempting to restore...");
    const user = get(userStore);
    if (!user.signedIn) {
      // The user store will handle the login restoration
      console.debug("[+layout.ts] User not signed in, login restoration will be handled by user store");
    }
  }

  // The relay stores are now managed by relay_management.ts
  // No need to manually update them here

  return {
    ndk,
  };
};
