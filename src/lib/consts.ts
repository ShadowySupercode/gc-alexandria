// AI SHOULD NEVER CHANGE THIS FILE

export const wikiKind = 30818;
export const indexKind = 30040;
export const zettelKinds = [30041, 30818, 30023];
export const repostKinds = [6, 16];

export const communityRelays = [
  "wss://theforest.nostr1.com",
  //"wss://theforest.gitcitadel.eu"
];

export const searchRelays = [
  "wss://thecitadel.nostr1.com",
  "wss://aggr.nostr.land",
  "wss://relay.noswhere.com",
  "wss://nostr.wine",
  "wss://relay.damus.io",
  "wss://freelay.sovbit.host",
  "wss://nostr.sovbit.host",
  "wss://nostr.wine",
  "wss://nostr21.com"
];

export const secondaryRelays = [
  "wss://theforest.nostr1.com",
  //"wss://theforest.gitcitadel.eu"
  "wss://nostr.land"
];

export const anonymousRelays = [
  "wss://freelay.sovbit.host",
  "wss://thecitadel.nostr1.com",
];

export const lowbandwidthRelays = [
  "wss://theforest.nostr1.com",
  "wss://thecitadel.nostr1.com",
  "wss://aggr.nostr.land",
];

export const localRelays: string[] = [
  "ws://localhost:8080",
  "ws://localhost:4869",
  "ws://localhost:3334",
  "ws://localhost:7777"
];

export enum FeedType {
  CommunityRelays = "standard",
  UserRelays = "user",
}

export const EXPIRATION_DURATION = 28 * 24 * 60 * 60; // 4 weeks in seconds

export const loginStorageKey = "alexandria/login/pubkey";
export const feedTypeStorageKey = "alexandria/feed/type";
