import { writable } from "svelte/store";
import { NostrProfile } from "../../../utils/nostrUtils.ts";
import { NDKUser } from "@nostr-dev-kit/ndk";
import { NDKSigner } from "@nostr-dev-kit/ndk";

// TODO: Update this file to implement and export the Svelte store contract, with the
// implementation writing to and reading from local browser storage.

export interface UserState {
  pubkey: string | null;
  npub: string | null;
  profile: NostrProfile | null;
  relays: { inbox: string[]; outbox: string[] };
  loginMethod: "extension" | "amber" | "npub" | null;
  ndkUser: NDKUser | null;
  signer: NDKSigner | null;
  signedIn: boolean;
}

export const userStore = writable<UserState>({
  pubkey: null,
  npub: null,
  profile: null,
  relays: { inbox: [], outbox: [] },
  loginMethod: null,
  ndkUser: null,
  signer: null,
  signedIn: false,
});
