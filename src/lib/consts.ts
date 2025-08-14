// AI SHOULD NEVER CHANGE THIS FILE

export const wikiKind = 30818;
export const indexKind = 30040;
export const zettelKinds = [30041, 30818, 30023];

export const communityRelays = [
  "wss://theforest.nostr1.com",
  //"wss://theforest.gitcitadel.eu"
];

export const searchRelays = [
  "wss://profiles.nostr1.com",
  "wss://aggr.nostr.land",
  "wss://relay.noswhere.com",
  "wss://nostr.wine",
  "wss://relay.damus.io",
  "wss://relay.nostr.band",
  "wss://freelay.sovbit.host"
];

export const secondaryRelays = [
  "wss://theforest.nostr1.com",
  //"wss://theforest.gitcitadel.eu"
  "wss://thecitadel.nostr1.com",
  //"wss://thecitadel.gitcitadel.eu",
  "wss://nostr.land",
  "wss://nostr.wine",
  "wss://nostr.sovbit.host",
  "wss://nostr21.com",
];

export const anonymousRelays = [
  "wss://freelay.sovbit.host",
  "wss://thecitadel.nostr1.com",
  "wss://relay.damus.io",
  "wss://relay.nostr.band"
];

export const lowbandwidthRelays = [
  "wss://theforest.nostr1.com",
  "wss://thecitadel.nostr1.com",
  "wss://aggr.nostr.land",
];

export const localRelays: string[] = [
  "wss://localhost:8080",
  "wss://localhost:4869",
  "wss://localhost:3334"
];

export enum FeedType {
  CommunityRelays = "standard",
  UserRelays = "user",
}

export const EXPIRATION_DURATION = 28 * 24 * 60 * 60; // 4 weeks in seconds

export const loginStorageKey = "alexandria/login/pubkey";
export const feedTypeStorageKey = "alexandria/feed/type";
