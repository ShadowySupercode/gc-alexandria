// AI-NOTE: This file contains common or shared functionality for the auth module.

import NDK, { NDKRelay, NDKRelayAuthPolicies, NDKRelaySet } from "@nostr-dev-kit/ndk";
import { loginStorageKey } from "../../../consts.ts";
import { NDKUser } from "../../../utils/nostrUtils.ts";
import { get } from "svelte/store";
import { activeInboxRelays, activeOutboxRelays } from "../../../ndk.ts";

const loginMethodStorageKey = "alexandria/login/method";

function persistLogin(user: NDKUser, method: "extension" | "amber" | "npub") {
  localStorage.setItem(loginStorageKey, user.pubkey);
  localStorage.setItem(loginMethodStorageKey, method);
}

function clearLogin() {
  localStorage.removeItem(loginStorageKey);
  localStorage.removeItem(loginMethodStorageKey);
}

async function getUserPreferredRelays(
  ndk: NDK,
  user: NDKUser,
      fallbacks: readonly string[] = [...get(activeInboxRelays), ...get(activeOutboxRelays)],
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

export {
  loginMethodStorageKey,
  persistLogin,
  clearLogin,
  getUserPreferredRelays,
};
