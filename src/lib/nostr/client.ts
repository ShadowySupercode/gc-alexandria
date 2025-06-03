import type { 
  NostrEvent, 
  NostrFilter, 
  NostrUser, 
  NostrRelaySet as INostrRelaySet,
  NostrRelay
} from '$lib/types/nostr';
import { getEventHash } from '$lib/utils/eventUtils';
import { NostrEncodingImpl } from '$lib/utils/identifierUtils';

// Discriminated union type for NIP-19 input
export type NoteIdInput = 
  | { type: 'note' | 'npub'; value: string }
  | { type: 'nevent'; id: string; relays?: string[] }
  | { type: 'nprofile'; pubkey: string; relays?: string[] }
  | { type: 'naddr'; kind: number; pubkey: string; identifier: string; relays?: string[] };

// Discriminated union type for decoded NIP-19
export type DecodedNoteId = 
  | { type: 'note' | 'npub'; value: string }
  | { type: 'nevent'; id: string; relays?: string[] }
  | { type: 'nprofile'; pubkey: string; relays?: string[] }
  | { type: 'naddr'; kind: number; pubkey: string; identifier: string; relays?: string[] };

// WebSocket-based relay implementation
class WebSocketRelay implements NostrRelay {
  private ws: WebSocket | null = null;
  private subscriptions: Map<string, Set<(event: NostrEvent) => void>> = new Map();
  private pendingMessages: string[] = [];
  private isConnecting = false;
  private authRequired = false;
  private authPromise: Promise<void> | null = null;
  private client: NostrClient;

  constructor(public url: string, client: NostrClient) {
    this.client = client;
  }

  get status(): 'connected' | 'disconnected' | 'connecting' {
    if (!this.ws) return 'disconnected';
    if (this.isConnecting) return 'connecting';
    return this.ws.readyState === WebSocket.OPEN ? 'connected' : 'disconnected';
  }

  private async handleAuth(challenge: string): Promise<void> {
    if (!window.nostr) {
      throw new Error('Nostr WebExtension not found. Please install a Nostr WebExtension like Alby or nos2x.');
    }

    try {
      // Get the active user
      const user = this.client.getActiveUser();
      if (!user) {
        throw new Error('No active user found');
      }

      // Create the auth event
      const authEvent: Omit<NostrEvent, 'id' | 'sig'> = {
        pubkey: user.pubkey,
        kind: 22242,
        content: '',
        tags: [
          ['relay', this.url],
          ['challenge', challenge]
        ],
        created_at: Math.floor(Date.now() / 1000)
      };

      // Sign the event using the WebExtension
      const signedEvent = await window.nostr.signEvent(authEvent);
      const completeEvent = {
        ...authEvent,
        id: getEventHash(authEvent),
        sig: signedEvent.sig
      };

      // Send the auth event
      const message = JSON.stringify(['AUTH', completeEvent]);
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(message);
      } else {
        this.pendingMessages.push(message);
      }
    } catch (error) {
      console.error('Auth failed:', error);
      throw error;
    }
  }

  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.isConnecting = true;
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
        
        this.ws.onopen = () => {
          this.isConnecting = false;
          // Send any pending messages
          while (this.pendingMessages.length > 0) {
            const msg = this.pendingMessages.shift();
            if (msg) this.ws?.send(msg);
          }
          resolve();
        };

        this.ws.onclose = () => {
          this.isConnecting = false;
          this.ws = null;
          this.authRequired = false;
          this.authPromise = null;
          // Attempt to reconnect after a delay
          setTimeout(() => this.connect(), 5000);
        };

        this.ws.onerror = (error) => {
          this.isConnecting = false;
          reject(error);
        };

        this.ws.onmessage = async (message) => {
          try {
            const [type, ...rest] = JSON.parse(message.data);
            
            switch (type) {
              case 'EVENT': {
                const [subscriptionId, event] = rest;
                if (subscriptionId) {
                  const callbacks = this.subscriptions.get(subscriptionId);
                  if (callbacks) {
                    callbacks.forEach(cb => cb(event));
                  }
                }
                break;
              }
              case 'AUTH': {
                const challenge = rest[0];
                this.authRequired = true;
                if (!this.authPromise) {
                  this.authPromise = this.handleAuth(challenge);
                }
                await this.authPromise;
                break;
              }
              case 'OK': {
                const [success, message] = rest;
                if (!success && message === 'auth-required') {
                  this.authRequired = true;
                  // The relay will send an AUTH message with the challenge
                }
                break;
              }
              case 'EOSE': {
                // End of stored events
                break;
              }
              case 'NOTICE': {
                const [notice] = rest;
                console.warn('Relay notice:', notice);
                break;
              }
            }
          } catch (e) {
            console.error('Error parsing relay message:', e);
          }
        };
      } catch (e) {
        this.isConnecting = false;
        reject(e);
      }
    });
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  async publish(event: NostrEvent): Promise<void> {
    const message = JSON.stringify(['EVENT', event]);
    
    // If auth is required but not yet handled, wait for it
    if (this.authRequired && this.authPromise) {
      await this.authPromise;
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(message);
    } else {
      this.pendingMessages.push(message);
      await this.connect();
    }
  }

  subscribe(filter: NostrFilter, callback: (event: NostrEvent) => void): string {
    const subscriptionId = Math.random().toString(36).substring(2);
    if (!this.subscriptions.has(subscriptionId)) {
      this.subscriptions.set(subscriptionId, new Set());
    }
    this.subscriptions.get(subscriptionId)?.add(callback);

    const message = JSON.stringify(['REQ', subscriptionId, filter]);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(message);
    } else {
      this.pendingMessages.push(message);
      this.connect();
    }

    return subscriptionId;
  }

  unsubscribe(subscriptionId: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(['CLOSE', subscriptionId]));
    }
    this.subscriptions.delete(subscriptionId);
  }
}

// WebSocket-based relay set implementation
class WebSocketRelaySet implements INostrRelaySet {
  private relayMap: Map<string, WebSocketRelay> = new Map();
  private client: NostrClient;

  constructor(relayUrls: string[], client: NostrClient) {
    this.client = client;
    relayUrls.forEach(url => {
      this.relayMap.set(url, new WebSocketRelay(url, client));
    });
  }

  get relays(): NostrRelay[] {
    return Array.from(this.relayMap.values());
  }

  addRelay(relay: NostrRelay): void {
    if (relay instanceof WebSocketRelay) {
      this.relayMap.set(relay.url, relay);
    }
  }

  removeRelay(url: string): void {
    const relay = this.relayMap.get(url);
    if (relay) {
      relay.disconnect();
      this.relayMap.delete(url);
    }
  }

  getRelay(url: string): NostrRelay | undefined {
    return this.relayMap.get(url);
  }
}

// Our own NostrClient implementation
export class NostrClient {
  private relaySet: WebSocketRelaySet;
  private activeUser: NostrUser | null = null;
  private userCache: Map<string, NostrUser> = new Map();

  constructor(relays: string[] = []) {
    this.relaySet = new WebSocketRelaySet(relays, this);
  }

  // Connection management
  async connect(): Promise<void> {
    await Promise.all(
      this.relaySet.relays.map(relay => relay.connect())
    );
  }

  async disconnect(): Promise<void> {
    await Promise.all(
      this.relaySet.relays.map(relay => relay.disconnect())
    );
  }

  // Event operations
  async publish(event: NostrEvent): Promise<void> {
    await Promise.all(
      this.relaySet.relays.map(relay => relay.publish(event))
    );
  }

  async fetchEvents(filter: NostrFilter): Promise<NostrEvent[]> {
    const events = new Map<string, NostrEvent>();
    const promises = this.relaySet.relays.map(relay => 
      new Promise<void>((resolve) => {
        const subscriptionId = relay.subscribe(filter, (event) => {
          if (!events.has(event.id)) {
            events.set(event.id, event);
          }
        });
        
        // Set a timeout to close the subscription
        setTimeout(() => {
          relay.unsubscribe(subscriptionId);
          resolve();
        }, 5000); // 5 second timeout
      })
    );

    await Promise.all(promises);
    return Array.from(events.values());
  }

  async fetchEvent(filter: NostrFilter): Promise<NostrEvent | null> {
    const events = await this.fetchEvents({ ...filter, limit: 1 });
    return events[0] || null;
  }

  // Subscription handling
  subscribe(filter: NostrFilter, opts?: { 
    closeOnEose?: boolean; 
    groupable?: boolean;
    skipVerification?: boolean;
    skipValidation?: boolean;
  }): {
    on: (event: 'event', callback: (event: NostrEvent) => void) => { stop: () => void };
    stop: () => void;
  } {
    const subscriptionIds = new Set<string>();
    const callbacks = new Set<(event: NostrEvent) => void>();

    return {
      on: (event: 'event', callback: (event: NostrEvent) => void) => {
        callbacks.add(callback);
        
        // Subscribe to all relays
        this.relaySet.relays.forEach(relay => {
          const subscriptionId = relay.subscribe(filter, (event) => {
            callbacks.forEach(cb => cb(event));
          });
          subscriptionIds.add(subscriptionId);
        });

        return {
          stop: () => {
            subscriptionIds.forEach(id => {
              this.relaySet.relays.forEach(relay => {
                relay.unsubscribe(id);
              });
            });
            subscriptionIds.clear();
            callbacks.delete(callback);
          }
        };
      },
      stop: () => {
        subscriptionIds.forEach(id => {
          this.relaySet.relays.forEach(relay => {
            relay.unsubscribe(id);
          });
        });
        subscriptionIds.clear();
        callbacks.clear();
      }
    };
  }

  // Relay management
  getConnectedRelays(): string[] {
    return this.relaySet.relays
      .filter(relay => relay.status === 'connected')
      .map(relay => relay.url);
  }

  getRelaySet(relays: string[]): INostrRelaySet {
    return new WebSocketRelaySet(relays, this);
  }

  // User management
  /**
   * Fetches the user's preferred relays (NIP-65, kind 10002) from primary relays, falling back to fallback relays if not found.
   * @param user The Nostr user
   * @returns [inbox, outbox] relay sets
   */
  async getUserPreferredRelays(user: NostrUser): Promise<[Set<string>, Set<string>]> {
    const inbox = new Set<string>();
    const outbox = new Set<string>();
    let relayList = await this.fetchEvent({
      kinds: [10002],
      authors: [user.pubkey]
    });

    if (!relayList) {
      const { fetchEventWithFallback } = await import('$lib/utils/relayUtils');
      const { fallbackRelays } = await import('$lib/consts');
      const result = await fetchEventWithFallback(
        { kinds: [10002], authors: [user.pubkey] },
        { relays: fallbackRelays, useFallbackRelays: false }
      );
      relayList = result.event;
    }

    if (relayList) {
      relayList.tags.forEach(tag => {
        if (tag[0] === 'r') {
          const url = tag[1];
          const marker = tag[2];
          if (marker === 'read') {
            inbox.add(url);
          } else if (marker === 'write') {
            outbox.add(url);
          } else {
            // No marker: both read and write
            inbox.add(url);
            outbox.add(url);
          }
        }
      });
    }
    return [inbox, outbox];
  }

  async getUser(pubkey: string): Promise<NostrUser | null> {
    // Check cache first
    if (this.userCache.has(pubkey)) {
      return this.userCache.get(pubkey)!;
    }

    // Fetch user metadata
    const metadata = await this.fetchEvent({
      kinds: [0],
      authors: [pubkey]
    });

    if (!metadata) return null;

    try {
      const content = JSON.parse(metadata.content);
      const user: NostrUser = {
        pubkey,
        npub: this.encoding.encodeNpub(pubkey),
        name: content.name,
        displayName: content.display_name,
        image: content.picture,
        about: content.about,
        nip05: content.nip05,
        validateNip05: async (nip05: string) => {
          return this.validateNip05(nip05, pubkey);
        }
      };
      this.userCache.set(pubkey, user);
      return user;
    } catch (e) {
      console.error('Error parsing user metadata:', e);
      return null;
    }
  }

  async getUserFromNip05(nip05: string): Promise<NostrUser | null> {
    try {
      // Parse NIP-05 identifier
      const [name, domain] = nip05.split('@');
      if (!name || !domain) {
        throw new Error('Invalid NIP-05 identifier');
      }

      // Fetch NIP-05 verification document
      const response = await fetch(`https://${domain}/.well-known/nostr.json`);
      if (!response.ok) {
        throw new Error(`Failed to fetch NIP-05 verification document: ${response.statusText}`);
      }

      const data = await response.json();
      if (!data.names || typeof data.names !== 'object') {
        throw new Error('Invalid NIP-05 verification document');
      }

      // Look up the name in the verification document
      const pubkey = data.names[name];
      if (!pubkey || typeof pubkey !== 'string') {
        throw new Error('Name not found in NIP-05 verification document');
      }

      // Get user metadata
      return await this.getUser(pubkey);
    } catch (error) {
      console.error('NIP-05 lookup failed:', error);
      return null;
    }
  }

  async validateNip05(nip05: string, pubkey: string): Promise<boolean> {
    try {
      // Parse NIP-05 identifier
      const [name, domain] = nip05.split('@');
      if (!name || !domain) {
        return false;
      }

      // Fetch NIP-05 verification document
      const response = await fetch(`https://${domain}/.well-known/nostr.json`);
      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      if (!data.names || typeof data.names !== 'object') {
        return false;
      }

      // Check if the name maps to the given pubkey
      const verifiedPubkey = data.names[name];
      return verifiedPubkey === pubkey;
    } catch (error) {
      console.error('NIP-05 validation failed:', error);
      return false;
    }
  }

  getActiveUser(): NostrUser | null {
    return this.activeUser;
  }

  setActiveUser(user: NostrUser | null): void {
    this.activeUser = user;
  }

  // Encoding utilities
  encoding = NostrEncodingImpl;

  /**
   * Decodes a NIP-19 identifier into its components.
   * @param input The NIP-19 identifier to decode
   * @returns The decoded identifier components
   */
  decodeNoteId(input: string): DecodedNoteId {
    const decoded = this.encoding.decode(input);
    
    switch (decoded.type) {
      case 'note':
        return { type: 'note', value: decoded.data as string };
      case 'npub':
        return { type: 'npub', value: decoded.data as string };
      case 'nevent': {
        const data = decoded.data as { id: string; relays?: string[] };
        return { type: 'nevent', id: data.id, relays: data.relays };
      }
      case 'nprofile': {
        const data = decoded.data as { pubkey: string; relays?: string[] };
        return { type: 'nprofile', pubkey: data.pubkey, relays: data.relays };
      }
      case 'naddr': {
        const data = decoded.data as { 
          pubkey: string; 
          kind: number; 
          identifier: string; 
          relays?: string[] 
        };
        return { 
          type: 'naddr', 
          pubkey: data.pubkey, 
          kind: data.kind, 
          identifier: data.identifier, 
          relays: data.relays 
        };
      }
      default:
        throw new Error(`Unsupported NIP-19 type: ${decoded.type}`);
    }
  }
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('Invalid hex string');
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    arr[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return arr;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Singleton instance
let nostrClientInstance: NostrClient | null = null;

/**
 * Gets a NostrClient instance, creating one if it doesn't exist
 * @param relays Optional list of relay URLs to connect to
 * @returns A NostrClient instance
 */
export function getNostrClient(relays: string[] = []): NostrClient {
  if (!nostrClientInstance) {
    nostrClientInstance = new NostrClient(relays);
  } else if (relays.length > 0) {
    // Update relays if provided
    nostrClientInstance = new NostrClient(relays);
  }
  return nostrClientInstance;
} 