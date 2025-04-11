export const wikiKind = 30818;
export const indexKind = 30040;
export const zettelKinds = [ 30041, 30818 ];
export const standardRelays = [ 'wss://thecitadel.nostr1.com', 'wss://relay.noswhere.com' ];
export const bootstrapRelays = [ 'wss://purplepag.es', 'wss://relay.noswhere.com' ];

/**
 * Additional large relays to include when fetching events
 */
export const additionalLargeRelays = [
  'wss://nostr.land',
  'wss://relay.nostr.band',
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://nostr.wine',
  'wss://relay.primal.net'
];

export enum FeedType {
  StandardRelays = 'standard',
  UserRelays = 'user',
}

export const loginStorageKey = 'alexandria/login/pubkey';
export const feedTypeStorageKey = 'alexandria/feed/type';
