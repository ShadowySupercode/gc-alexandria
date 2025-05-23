export const wikiKind = 30818;
export const indexKind = 30040;
export const zettelKinds = [ 30041, 30818 ];
export const communityRelay = [ 'wss://theforest.nostr1.com' ];
export const standardRelays = [ 'wss://thecitadel.nostr1.com', 'wss://theforest.nostr1.com' ];
export const fallbackRelays = [ 
  'wss://purplepag.es',
  'wss://indexer.coracle.social',
  'wss://relay.noswhere.com',
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://relay.lumina.rocks',
  'wss://nostr.wine',
  'wss://nostr.land'
];

export enum FeedType {
  StandardRelays = 'standard',
  UserRelays = 'user',
}

export const loginStorageKey = 'alexandria/login/pubkey';
export const feedTypeStorageKey = 'alexandria/feed/type';
