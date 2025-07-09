export const wikiKind = 30818;
export const indexKind = 30040;
export const zettelKinds = [ 30041, 30818 ];
export const communityRelay = [ 'wss://theforest.nostr1.com' ];
export const standardRelays = [ 
  'wss://thecitadel.nostr1.com', 
  'wss://theforest.nostr1.com',
  'wss://profiles.nostr1.com',
  'wss://gitcitadel.nostr1.com',
  //'wss://thecitadel.gitcitadel.eu',
  //'wss://theforest.gitcitadel.eu',
];

// Non-auth relays for anonymous users
export const anonymousRelays = [
  'wss://thecitadel.nostr1.com', 
  'wss://theforest.nostr1.com',
  'wss://profiles.nostr1.com',
  'wss://freelay.sovbit.host',
];
export const fallbackRelays = [ 
  'wss://purplepag.es',
  'wss://indexer.coracle.social',
  'wss://relay.noswhere.com',
  'wss://aggr.nostr.land',
  'wss://nostr.wine',
  'wss://nostr.land',
  'wss://nostr.sovbit.host',
  'wss://freelay.sovbit.host',
  'wss://nostr21.com',
  'wss://greensoul.space',
];

export enum FeedType {
  StandardRelays = 'standard',
  UserRelays = 'user',
}

export const loginStorageKey = 'alexandria/login/pubkey';
export const feedTypeStorageKey = 'alexandria/feed/type';
