import { getPersistedLogin, initNdk, ndkInstance } from "../lib/ndk.ts";
import {
  loginWithExtension,
  loginWithAmber,
  loginWithNpub,
} from "../lib/stores/userStore.ts";
import { loginMethodStorageKey } from "../lib/stores/userStore.ts";
import Pharos, { pharosInstance } from "../lib/parser.ts";
import type { LayoutLoad } from "./$types";
import { get } from "svelte/store";
import { browser } from "$app/environment";

// AI-NOTE: Leave SSR off until event fetches are implemented server-side.
export const ssr = false;

/**
   * Attempts to restore the user's authentication session from localStorage.
   * Handles extension, Amber (NIP-46), and npub login methods.
   */
function restoreAuthSession() {
  try {
    const pubkey = getPersistedLogin();
    const loginMethod = localStorage.getItem(loginMethodStorageKey);
    const logoutFlag = localStorage.getItem("alexandria/logout/flag");
    console.log("Layout load - persisted pubkey:", pubkey);
    console.log("Layout load - persisted login method:", loginMethod);
    console.log("Layout load - logout flag:", logoutFlag);
    console.log("All localStorage keys:", Object.keys(localStorage));

    if (pubkey && loginMethod && !logoutFlag) {
      if (loginMethod === "extension") {
        console.log("Restoring extension login...");
        loginWithExtension();
      } else if (loginMethod === "amber") {
        // Attempt to restore Amber (NIP-46) session from localStorage
        const relay = "wss://relay.nsec.app";
        const localNsec = localStorage.getItem("amber/nsec");
        if (localNsec) {
          import("@nostr-dev-kit/ndk").then(
            async ({ NDKNip46Signer }) => {
              const ndk = get(ndkInstance);
              try {
                // deno-lint-ignore no-explicit-any
                const amberSigner = (NDKNip46Signer as any).nostrconnect(
                  ndk,
                  relay,
                  localNsec,
                  {
                    name: "Alexandria",
                    perms: "sign_event:1;sign_event:4",
                  },
                );
                // Try to reconnect (blockUntilReady will resolve if Amber is running and session is valid)
                await amberSigner.blockUntilReady();
                const user = await amberSigner.user();
                await loginWithAmber(amberSigner, user);
                console.log("Amber session restored.");
              } catch {
                // If reconnection fails, automatically fallback to npub-only mode
                console.warn(
                  "Amber session could not be restored. Falling back to npub-only mode.",
                );
                try {
                  // Set the flag first, before login
                  localStorage.setItem("alexandria/amber/fallback", "1");
                  console.log("Set fallback flag in localStorage");

                  // Small delay to ensure flag is set
                  await new Promise((resolve) => setTimeout(resolve, 100));

                  await loginWithNpub(pubkey);
                  console.log("Successfully fell back to npub-only mode.");
                } catch (fallbackErr) {
                  console.error(
                    "Failed to fallback to npub-only mode:",
                    fallbackErr,
                  );
                }
              }
            },
          );
        } else {
          // No session data, automatically fallback to npub-only mode
          console.log(
            "No Amber session data found. Falling back to npub-only mode.",
          );

          // Set the flag first, before login
          localStorage.setItem("alexandria/amber/fallback", "1");
          console.log("Set fallback flag in localStorage");

          // Small delay to ensure flag is set
          setTimeout(async () => {
            try {
              await loginWithNpub(pubkey);
              console.log("Successfully fell back to npub-only mode.");
            } catch (fallbackErr) {
              console.error(
                "Failed to fallback to npub-only mode:",
                fallbackErr,
              );
            }
          }, 100);
        }
      } else if (loginMethod === "npub") {
        console.log("Restoring npub login...");
        loginWithNpub(pubkey);
      }
    } else if (logoutFlag) {
      console.log("Skipping auto-login due to logout flag");
      localStorage.removeItem("alexandria/logout/flag");
    }
  } catch (e) {
    console.warn(
      `Failed to restore login: ${e}\n\nContinuing with anonymous session.`,
    );
  }
}

export const load: LayoutLoad = () => {
  // Initialize NDK with new relay management system
  const ndk = initNdk();
  ndkInstance.set(ndk);

  if (browser) {
    restoreAuthSession();
  }

  const parser = new Pharos(ndk);
  pharosInstance.set(parser);  

  return {
    ndk,
    parser,
  };
};
