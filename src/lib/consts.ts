export const wikiKind = 30818;
export const indexKind = 30040;
export const SectionKinds = [30041, 30818];

export const socialRelays = [
  "wss://theforest.nostr1.com"
];
export const communityRelays = [
  "wss://thecitadel.nostr1.com",
  "wss://theforest.nostr1.com",
];
export const fallbackRelays = [
  "wss://purplepag.es",
  "wss://indexer.coracle.social",
  "wss://relay.noswhere.com",
  "wss://relay.damus.io",
  "wss://relay.nostr.band",
  "wss://relay.lumina.rocks",
  "wss://nostr.wine",
  "wss://nostr.land",
];
export const localRelays = [
  "ws://localhost:4869",
  "ws://localhost:8080",
  "ws://localhost:8735",
];

export enum FeedType {
  SocialRelays = "social",
  UserRelays = "user",
  CommunityRelays = "community"
}

export const loginStorageKey = "alexandria/login/pubkey";
export const feedTypeStorageKey = "alexandria/feed/type";
