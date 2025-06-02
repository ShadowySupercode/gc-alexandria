// Nostr event types
export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

// Unsigned Nostr event (before signing)
export type NostrUnsignedEvent = Omit<NostrEvent, 'id' | 'sig'>;

// Nostr profile types
export interface NostrProfile {
  name?: string;
  display_name?: string;
  displayName?: string;
  nip05?: string;
  picture?: string;
  about?: string;
  banner?: string;
  website?: string;
  lud16?: string;
}

// Nostr user types
export interface NostrUser {
  pubkey: string;
  npub?: string;
  name?: string;
  displayName?: string;
  image?: string;
  about?: string;
  nip05?: string;
  relayUrls?: string[];
  validateNip05(nip05: string): Promise<boolean>;
}

// Nostr relay types
export interface NostrRelay {
  url: string;
  status: 'connected' | 'disconnected' | 'connecting';
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  publish(event: NostrEvent): Promise<void>;
  subscribe(filter: NostrFilter, callback: (event: NostrEvent) => void): string;
  unsubscribe(subscriptionId: string): void;
}

export interface NostrRelaySet {
  relays: NostrRelay[];
  addRelay(relay: NostrRelay): void;
  removeRelay(url: string): void;
  getRelay(url: string): NostrRelay | undefined;
}

// Nostr filter types
export interface NostrFilter {
  ids?: string[];
  authors?: string[];
  kinds?: number[];
  since?: number;
  until?: number;
  limit?: number;
  search?: string;
  [key: string]: any;
}

// Nostr encoding/decoding types
export interface NostrEncoding {
  // NIP-19 encoding
  encodeNpub(pubkey: string): string;
  encodeNote(noteId: string): string;
  encodeNevent(params: { id: string; relays?: string[] }): string;
  encodeNprofile(params: { pubkey: string; relays?: string[] }): string;
  encodeNaddr(params: { 
    pubkey: string; 
    kind: number; 
    identifier: string; 
    relays?: string[] 
  }): string;
  
  // NIP-19 decoding
  decode(input: string): {
    type: 'npub' | 'nprofile' | 'note' | 'nevent' | 'naddr';
    data: any;
  };
}

// NIP-19 types
export type DecodedNoteId = 
  | { type: 'note' | 'npub'; value: string }
  | { type: 'nevent'; id: string; relays?: string[] }
  | { type: 'nprofile'; pubkey: string; relays?: string[] }
  | { type: 'naddr'; kind: number; pubkey: string; identifier: string; relays?: string[] };

// Nostr client interface
export interface NostrClient {
  // Connection management
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getConnectedRelays(): string[];
  
  // Event operations
  publish(event: NostrEvent): Promise<void>;
  fetchEvents(filter: NostrFilter): Promise<NostrEvent[]>;
  fetchEvent(filter: NostrFilter): Promise<NostrEvent | null>;
  
  // Subscription handling
  subscribe(filter: NostrFilter, opts?: { 
    closeOnEose?: boolean; 
    groupable?: boolean;
    skipVerification?: boolean;
    skipValidation?: boolean;
  }): {
    on: (event: 'event', callback: (event: NostrEvent) => void) => { stop: () => void };
    stop: () => void;
  };
  
  // User management
  getUser(pubkey: string): Promise<NostrUser | null>;
  getUserFromNip05(nip05: string): Promise<NostrUser | null>;
  getActiveUser(): NostrUser | null;
  setActiveUser(user: NostrUser | null): void;
  
  // Relay management
  getRelaySet(relays: string[]): NostrRelaySet;
  getUserPreferredRelays(user: NostrUser): Promise<[Set<string>, Set<string>]>;
  
  // Encoding utilities
  encoding: NostrEncoding;
  decodeNoteId(input: string): DecodedNoteId;
} 